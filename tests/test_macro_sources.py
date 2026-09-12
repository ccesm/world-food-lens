import csv
from datetime import date
import io
from pathlib import Path
import sys
import unittest
from xml.sax.saxutils import escape
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from macro_sources import parse_fao, parse_eia, parse_world_bank, parse_usda, numeric

AS_OF = date(2026, 9, 12)


def workbook(unit="($/bbl)"):
    names = ["Crude oil, Brent", "Urea", "DAP", "TSP", "Potassium chloride **",
             "Wheat, US HRW", "Maize", "Rice, Thai 5% ", "Soybeans"]
    lines = [["Prices"], ["", *names], ["", unit, *["($/mt)"]*8],
             ["2026M07", 80, 400, 700, 600, 300, 250, 200, 450, 470],
             ["2026M08", 88, 390, 710, 610, 310, 260, 210, 460, 480]]
    rows = "".join('<row>'+"".join(f'<c r="{chr(65+j)}{i+1}" t="inlineStr"><is><t>{escape(str(value))}</t></is></c>'
                    for j,value in enumerate(row))+"</row>" for i,row in enumerate(lines))
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w") as archive:
        archive.writestr("xl/workbook.xml", '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Hidden" r:id="rId1"/><sheet name="Monthly Prices" r:id="rId2"/></sheets></workbook>')
        archive.writestr("xl/_rels/workbook.xml.rels", '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>')
        archive.writestr("xl/worksheets/sheet1.xml", "<invalid/>")
        archive.writestr("xl/worksheets/sheet2.xml", '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+rows+"</sheetData></worksheet>")
    return stream.getvalue()


def usda_zip(missing=False, duplicate=False, unit="(1000 MT)"):
    stream = io.StringIO()
    headers = ["Commodity_Code","Country_Name","Country_Code","Market_Year","Calendar_Year","Month",
               "Attribute_Description","Unit_Description","Value"]
    writer = csv.DictWriter(stream, fieldnames=headers); writer.writeheader()
    for year in (2025,2026):
        for country, scale in (("European Union",10),("France",3),("United Kingdom",2),("China",20)):
            for attribute, value in (("Production",110),("Domestic Consumption",100),("Ending Stocks",30)):
                if missing and country == "China" and attribute == "Ending Stocks": continue
                row = dict(zip(headers,["0410000",country,country,year,2026,"09",attribute,unit,value*scale]))
                writer.writerow(row)
                if duplicate: writer.writerow(row)
    zipped = io.BytesIO()
    with zipfile.ZipFile(zipped,"w") as archive:
        archive.writestr("psd_grains_pulses.csv",stream.getvalue())
    return zipped.getvalue()


class MacroTests(unittest.TestCase):
    def test_fao_header_base_and_adjacent_change(self):
        text = "FAO Food Price Index\n2014-2016=100\nDate,Food Price Index\n2026-07,100\n2026-08,110\n2026-09,999\n"
        result = parse_fao(text,AS_OF)
        self.assertEqual(result["headline"]["period"],"2026-08")
        self.assertEqual(result["headline"]["momPct"],10)
        with self.assertRaises(ValueError):parse_fao(text.replace("2014-2016=100","2000=100"),AS_OF)
        with self.assertRaises(ValueError):parse_fao(text+"2026-08,111\n",AS_OF)

    def test_fao_gap_does_not_mislabel_change_as_month_on_month(self):
        data = parse_fao("2014-2016=100\nDate,Food Price Index\n2026-06,100\n2026-08,110",AS_OF)
        self.assertIsNone(data["headline"]["momPct"])

    def test_eia_table_and_unit_validation(self):
        cells = "".join(f"<td class='B3'>{80+i if i<8 else ''}</td>" for i in range(12))
        text = "Dollars per Barrel<tr><td class='B4'>&nbsp;2026</td>"+cells+"</tr>"
        data = parse_eia(text,AS_OF)
        self.assertEqual(data["headline"]["value"],87)
        with self.assertRaises(ValueError):parse_eia(text.replace("Dollars per Barrel","cents per gallon"),AS_OF)
        with self.assertRaises(ValueError):parse_eia(text.replace("<td class='B3'></td>","",1),AS_OF)

    def test_world_bank_named_sheet_units_and_tables(self):
        data = parse_world_bank(workbook(),AS_OF)
        self.assertEqual(data["headline"]["brent"]["value"],88)
        self.assertEqual(data["headline"]["brent"]["momPct"],10)
        self.assertEqual(data["headline"]["urea"]["momPct"],-2.5)
        self.assertEqual(len(data["fertilizers"]),4)
        self.assertEqual(len(data["agriculture"]),4)
        with self.assertRaises(ValueError):parse_world_bank(workbook("cents"),AS_OF)

    def test_usda_eu_not_double_counted_and_uk_separate(self):
        data = parse_usda(usda_zip(),AS_OF)
        self.assertEqual(data["latestPeriod"],"2026/2027")
        self.assertEqual(data["history"][-1]["consumption"],3200)
        self.assertEqual(data["history"][-1]["countryAreaCount"],3)
        self.assertEqual(data["stockToUse"],30)

    def test_usda_incomplete_duplicate_or_wrong_unit_is_rejected(self):
        for content in (usda_zip(missing=True),usda_zip(duplicate=True),usda_zip(unit="MT")):
            with self.assertRaises(ValueError):parse_usda(content,AS_OF)

    def test_missing_sentinels_and_zero_are_distinct(self):
        self.assertIsNone(numeric("…")); self.assertEqual(numeric(0),0)
        with self.assertRaises(ValueError):numeric("nan")


if __name__ == "__main__":unittest.main()
