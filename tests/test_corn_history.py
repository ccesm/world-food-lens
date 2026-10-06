import unittest
from pathlib import Path
from unittest.mock import patch
from corn_fixtures import progress_text, annual_text
from collect_corn_history import archive_links, parse_supply, canonical, text
from refresh_corn import parse_progress, row_numbers
from data_contract import valid_metadata


def supply_text(n=6):
    if n == 6:
        header = ' : 2011 : 2012 : 2011 : 2012 : 2011 : 2012\n'
        values = '80000 81000 140 150 11200000 12150000'
    else:
        header = ' State : : : : 2012 : :\n : 2011 : 2012 : 2011 :---: 2011 : 2012\n : : : : October 1 :November 1 : :\n'
        values = '80000 81000 140 (NA) 150 11200000 12150000'
    return ('Released November 8, 2012, by the National Agricultural Statistics Service\n'
            'Corn for Grain Area Harvested, Yield, and Production - States and United States: 2011 and\n'
            'Forecasted November 1, 2012\n-------------------------\n'
            'Area harvested : Yield per acre : Production\n' + header +
            '1,000 acres : bushels : 1,000 bushels\nUnited States ...: '+values+'\n(NA) Not available.\n')


class HistoricalArchiveTests(unittest.TestCase):
    def test_unused_na_does_not_discard_current_official_progress(self):
        for marker in ('(NA)', 'NA'):
            raw=progress_text().replace('50 60 75 55', f'50 {marker} 75 55')
            self.assertEqual(parse_progress(raw)['regions']['IA']['progress']['silking'], 75)

    def test_missing_current_percentage_still_fails_not_zero(self):
        for marker in ('(NA)', 'NA'):
            with self.assertRaises(ValueError):
                parse_progress(progress_text().replace('50 60 75 55',f'50 60 {marker} 55'))

    def test_explicit_revision_marker_supported_not_arbitrary_annotation(self):
        raw=progress_text().replace('50 60 75 55','50 *60 75 55').replace('Corn Dough','*  Revised.\nCorn Dough')
        self.assertEqual(parse_progress(raw)['regions']['IA']['progress']['silking'],75)
        with self.assertRaises(ValueError):
            parse_progress(raw.replace('*  Revised.',''))

    def test_missing_condition_remains_invalid(self):
        with self.assertRaises(ValueError):
            parse_progress(progress_text().replace('5 10 15 60 10','5 10 15 NA 10'))

    def test_archive_filter_does_not_fetch_latest_footer(self):
        url='/sites/default/release-files/a/report.txt'
        self.assertEqual(archive_links(f'<table><a href="{url}">txt</a></table><table><a href="/latest.txt">txt</a></table>'),['https://esmis.nal.usda.gov'+url])
        with self.assertRaises(ValueError):
            archive_links('<table><a href="https://example.org/x.txt">txt</a></table>')

    def test_supply_six_and_seven_columns_with_unavailable_prior_forecast(self):
        for n in (6,7):
            data=parse_supply(supply_text(n))
            self.assertEqual(data['national'],{'harvestedArea':81000,'yield':150,'production':12150000})

    def test_supply_wrong_units_year_or_current_missing_rejected(self):
        for raw in (supply_text().replace('1,000 bushels','tons'),supply_text().replace('2011 : 2012','2012 : 2011'),supply_text().replace('140 150','140 (NA)')):
            with self.assertRaises(ValueError):
                parse_supply(raw)

    def test_canonical_archive_does_not_fabricate_publication_clock(self):
        data=parse_supply(supply_text())
        r=canonical(data,'supply','https://esmis.nal.usda.gov/sites/default/release-files/a/test.txt','2026-10-05T01:00:00Z','a'*64)
        self.assertTrue(valid_metadata(r['metadata']))
        self.assertIsNone(r['metadata']['observation']['publishedAt'])
        self.assertEqual(r['metadata']['observation']['vintage'],'2012-11')
        self.assertEqual(r['metadata']['extensions']['historyKind'],'published-report-vintage')
        self.assertEqual(r['metadata']['accepted']['fetchedAt'],'2026-10-05T01:00:00Z')

    def test_report_notices_cannot_become_numeric_observations(self):
        with self.assertRaises(ValueError):
            parse_supply('USDA report delayed due to shutdown; scheduled for next month.')

