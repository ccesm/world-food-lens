import struct
import sys
import unittest
import zlib
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from refresh_drought import (CAPABILITIES, LAYERS, advertised_ranges, decode_indexed_png,
                             fetch_current, latest_periods, refresh, sample_color, verify_periods)

STAMP = "2026-09-22T06:23:00Z"


def capabilities(short="2026-08-21", long="2026-08-01", impact="2026-08-11"):
    return '<WMS_Capabilities xmlns="http://www.opengis.net/wms"><Capability><Layer>' + "".join(
        f'<Layer><Name>{name}</Name><Dimension name="time" units="ISO8601" default="2021-10">'
        f'1991-01-01/{end}/{cadence}</Dimension></Layer>'
        for name, end, cadence in [("spaST", short, "P10D"), ("spaLT", long, "P1M"), ("rdria", impact, "P10D")]
    ) + '</Layer></Capability></WMS_Capabilities>'


def maps():
    return {key: {"period": period} for key, period in
            zip(LAYERS, ["2026-08-21", "2026-08-01", "2026-08-11"])}


def indexed_png(width, height, depth, palette, indexes):
    packed_rows = []
    for row in indexes:
        packed = bytearray((width * depth + 7) // 8)
        for x, value in enumerate(row):
            shift = 8 - depth - (x * depth % 8)
            packed[x * depth // 8] |= value << shift
        packed_rows.append(b"\0" + bytes(packed))
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    header = struct.pack(">IIBBBBB", width, height, depth, 3, 0, 0, 0)
    colors = b"".join(bytes(color) for color in palette)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"PLTE", colors) + chunk(b"IDAT", zlib.compress(b"".join(packed_rows))) + chunk(b"IEND", b"")


class DroughtRefreshTests(unittest.TestCase):
    def test_period_discovery_and_indexed_png_sampling(self):
        html = 'LAYERS=spaST&amp;TIME=2026-08-21 LAYERS=spaLT&amp;TIME=2026-08-01 LAYERS=rdria&amp;TIME=2026-08-11'
        self.assertEqual(latest_periods(html), {"shortTerm": "2026-08-21", "longTerm": "2026-08-01", "impactRisk": "2026-08-11"})
        raw = indexed_png(4, 2, 2, [(255,255,254),(255,255,0),(255,170,0),(255,0,0)], [[0,1,2,3],[3,2,1,0]])
        image = decode_indexed_png(raw)
        self.assertEqual(sample_color(image, 45, -45), (255,255,0))
        self.assertEqual(sample_color(image, -45, -45), (255,170,0))
    def test_failed_refresh_retains_last_good_values(self):
        old={"schemaVersion":1,"status":"ok","fetchedAt":"old","maps":maps(),"points":{"x":{}},"periodVerified":True}
        old["maps"]["shortTerm"]["periodVerified"] = True
        result=refresh(old,[{"id":"x"}],lambda _: (_ for _ in ()).throw(ValueError("offline")),STAMP)
        self.assertEqual(result["status"],"error")
        self.assertEqual(result["fetchedAt"],"old")
        self.assertEqual(result["maps"]["shortTerm"]["period"],old["maps"]["shortTerm"]["period"])
        self.assertFalse(result["periodVerified"])
        self.assertFalse(result["maps"]["shortTerm"]["periodVerified"])
        self.assertTrue(old["maps"]["shortTerm"]["periodVerified"])
        self.assertEqual(old["status"],"ok")

    def test_advertised_ranges_corroborate_examples_without_using_default_date(self):
        selected = maps()
        result = verify_periods(selected, capabilities(), STAMP)
        self.assertTrue(result["periodVerified"])
        self.assertEqual(selected["shortTerm"]["availabilityEnd"], "2026-08-21")
        self.assertEqual(result["periodVerification"]["checkedAt"], STAMP)
        selected["shortTerm"]["period"] = "2026-08-11"
        self.assertTrue(verify_periods(selected, capabilities(), STAMP)["periodVerified"])

    def test_examples_ahead_of_advertised_end_are_not_verified(self):
        selected = maps()
        result = verify_periods(selected, capabilities(short="2026-08-11", long="2026-07-01"), STAMP)
        self.assertFalse(result["periodVerified"])
        self.assertFalse(selected["shortTerm"]["periodVerified"])
        self.assertFalse(selected["longTerm"]["periodVerified"])
        self.assertTrue(selected["impactRisk"]["periodVerified"])
        self.assertEqual(selected["shortTerm"]["period"], "2026-08-21")

    def test_missing_unknown_and_reversed_availability_fail_closed(self):
        self.assertFalse(verify_periods(maps(), "<WMS_Capabilities/>", STAMP)["periodVerified"])
        unknown = capabilities().replace("1991-01-01/2026-08-21/P10D", "2026-08-11,2026-08-21")
        self.assertNotIn("shortTerm", advertised_ranges(unknown))
        with self.assertRaises(ValueError):
            advertised_ranges(capabilities(short="1990-01-01"))

    def test_metadata_outage_keeps_maps_unverified(self):
        html = b'LAYERS=spaST&TIME=2026-08-21 LAYERS=spaLT&TIME=2026-08-01 LAYERS=rdria&TIME=2026-08-11'
        def response(request, **_):
            if request.full_url == CAPABILITIES:
                raise OSError("metadata offline")
            return BytesIO(html)
        with patch("refresh_drought.urlopen", side_effect=response), \
             patch("refresh_drought.decode_indexed_png", return_value={"width":1440,"height":720}), \
             patch("refresh_drought.sample_color", return_value=(255,255,254)):
            result = fetch_current([{"id":"x","lat":0,"lon":0}])
        self.assertFalse(result["periodVerified"])
        self.assertEqual(result["points"]["x"]["shortTerm"], "no-data")
        self.assertEqual(result["periodVerification"]["reason"], "availability-metadata-unavailable")

    def test_invalid_future_and_regressed_periods_retain_prior_data(self):
        old = {"schemaVersion":1,"status":"ok","fetchedAt":"old","maps":maps(),"points":{"x":{}}}
        for invalid in ("2026-02-30", "2027-01-01", "2026-08-11"):
            with self.subTest(period=invalid):
                candidate = {"maps":maps(),"points":{"changed":{}}}
                candidate["maps"]["shortTerm"]["period"] = invalid
                result = refresh(old, [], lambda _: candidate, STAMP)
                self.assertEqual(result["status"], "error")
                self.assertEqual(result["fetchedAt"], "old")
                self.assertEqual(result["points"], old["points"])
                self.assertEqual(result["maps"]["shortTerm"]["period"], "2026-08-21")
                self.assertFalse(result["periodVerified"])

    def test_unverified_refresh_cannot_inherit_previous_true_flag(self):
        old = {"schemaVersion":1,"maps":maps(),"periodVerified":True}
        result = refresh(old, [], lambda _: {"maps":maps(),"points":{}}, STAMP)
        self.assertEqual(result["status"], "ok")
        self.assertFalse(result["periodVerified"])
        self.assertTrue(old["periodVerified"])


if __name__ == "__main__":
    unittest.main()
