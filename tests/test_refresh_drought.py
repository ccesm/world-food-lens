import struct
import sys
import unittest
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from refresh_drought import decode_indexed_png, latest_periods, refresh, sample_color


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
        old={"schemaVersion":1,"status":"ok","fetchedAt":"old","maps":{"shortTerm":{}},"points":{"x":{}}}
        result=refresh(old,[{"id":"x"}],lambda _: (_ for _ in ()).throw(ValueError("offline")),"new")
        self.assertEqual(result["status"],"error")
        self.assertEqual(result["fetchedAt"],"old")
        self.assertEqual(result["maps"],old["maps"])
        self.assertEqual(old["status"],"ok")


if __name__ == "__main__":
    unittest.main()
