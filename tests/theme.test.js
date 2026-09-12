import test from "node:test";
import assert from "node:assert/strict";
import {nextTheme,resolveTheme,THEME_STORAGE_KEY} from "../src/services/theme.js";

test("saved theme overrides the system preference", () => {
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
});

test("first visit follows the system theme", () => {
  assert.equal(resolveTheme(null, true), "dark");
  assert.equal(resolveTheme(undefined, false), "light");
  assert.equal(resolveTheme("unexpected", true), "dark");
});

test("theme toggle alternates between light and dark", () => {
  assert.equal(nextTheme("light"), "dark");
  assert.equal(nextTheme("dark"), "light");
  assert.equal(THEME_STORAGE_KEY, "world-food-lens-theme");
});
