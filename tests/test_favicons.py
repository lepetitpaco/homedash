"""Icônes relayées : un nom d'hôte seulement, vers le service de favicons, en cache."""

import unittest
from unittest import mock

from tests import _path  # noqa: F401

import favicons


class Resp:
    def __init__(self, body, ctype):
        self.body, self.headers = body, {"Content-Type": ctype}

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def read(self, n=-1):
        return self.body


class FaviconsTest(unittest.TestCase):

    def setUp(self):
        favicons._cache.clear()
        self.urls = []

    def fake(self, body=b"\x89PNG...", ctype="image/png"):
        def _open(req):
            self.urls.append(req.full_url)
            return Resp(body, ctype)
        return mock.patch.object(favicons, "_open", _open)

    def test_only_the_provider_is_contacted_and_the_result_cached(self):
        with self.fake():
            self.assertEqual(favicons.get("Claude.ai")[1], "image/png")
            favicons.get("claude.ai")
        self.assertEqual(self.urls, ["https://www.google.com/s2/favicons?domain=claude.ai&sz=64"])

    def test_a_host_is_required_never_an_address(self):
        for bad in ("http://10.0.0.1/admin", "a/b", "", "x y", "-x.com", "a" * 300):
            with self.assertRaises(ValueError, msg=bad):
                favicons.get(bad)

    def test_non_images_are_refused(self):
        with self.fake(b"<html>", "text/html"):
            self.assertEqual(favicons.get("exemple.fr"), (None, ""))

    def test_the_site_itself_only_for_a_tab_of_the_config(self):
        with self.fake(b"<html>", "text/html"):
            favicons.get("toolbox.exemple.fr")
            favicons._cache.clear()
            favicons.get("toolbox.exemple.fr", own={"toolbox.exemple.fr"})
        direct = [u for u in self.urls if u.startswith("https://toolbox.")]
        self.assertEqual(direct, ["https://toolbox.exemple.fr/favicon.ico"])

    def test_configured_provider_is_used(self):
        with self.fake():
            favicons.get("x.com", "https://icons.example/{host}.png")
        self.assertEqual(self.urls, ["https://icons.example/x.com.png"])


if __name__ == "__main__":
    unittest.main()
