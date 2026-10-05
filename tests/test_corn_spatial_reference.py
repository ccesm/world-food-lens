import hashlib
import json
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]


class FrozenSpatialReferenceTests(unittest.TestCase):
    def test_iowa_reference_artifact_is_byte_identical(self):
        self.assertEqual(hashlib.sha256((ROOT/"research/iowa-spatial-summary.json").read_bytes()).hexdigest(),
                         "b1cd12ac741e916d8f4e179658f09228b1061692e1b3ffae82935aa4f0327c6d")

    def test_ten_state_reference_artifact_is_byte_identical(self):
        self.assertEqual(hashlib.sha256((ROOT/"research/cornbelt-spatial-summary.json").read_bytes()).hexdigest(),
                         "a2ebf57ca17eb378918a0c4ec4ed9a7cbcb961dc9591525fa2ab1acc4938c103")

    def test_common_grid_remains_frozen(self):
        c=json.loads((ROOT/"research/cornbelt_spatial/config.json").read_text())
        self.assertEqual(c["grid"],{"crs":"EPSG:5070","cellSizeM":9000,"originX":-52095,"originY":2288295,
                                    "edgeSegments":16,"version":"cornbelt-iowa-anchored-9km/1"})


if __name__=="__main__":unittest.main()
