"""Onglets perso : un fichier du disque servi en lecture seule, dans le dossier personnel."""

import os
import tempfile
import unittest
from unittest import mock

from tests import _path  # noqa: F401

import localfile
import localgit


class LocalFileTest(unittest.TestCase):

    def setUp(self):
        self.home = tempfile.mkdtemp(prefix="homedash-home-")
        os.makedirs(os.path.join(self.home, "docs"))
        os.makedirs(os.path.join(self.home, ".ssh"))
        for rel in ("docs/a.pdf", "docs/page.html", "docs/notes.md", ".ssh/id_rsa", "docs/.env"):
            with open(os.path.join(self.home, rel), "w") as f:
                f.write("x")
        self.outside = tempfile.NamedTemporaryFile(delete=False)
        self.addCleanup(os.unlink, self.outside.name)
        os.symlink(self.outside.name, os.path.join(self.home, "docs", "lien"))
        for target, value in ((localgit, "HOST_MOUNT"),):
            p = mock.patch.object(target, value, self.home)
            p.start()
            self.addCleanup(p.stop)

    def test_home_files_are_found(self):
        self.assertEqual(localfile.locate("~/docs/a.pdf"), os.path.realpath(f"{self.home}/docs/a.pdf"))
        self.assertTrue(localfile.locate("~/docs").endswith("/docs"))

    def test_outside_home_hidden_and_symlink_escape_are_refused(self):
        for bad in ("/etc/passwd", "~/../", "~/.ssh/id_rsa", "~/docs/.env", "~/docs/lien", "",
                    "~/docs/absent.pdf"):
            with self.assertRaises(ValueError, msg=bad):
                localfile.locate(bad)

    def test_a_homedash_data_dir_is_never_served(self):
        data = os.path.join(self.home, "dev", "homedash", "data")
        os.makedirs(os.path.join(data, "backups"))
        for rel in ("secrets.json", "config.json", "backups/b.json"):
            with open(os.path.join(data, rel), "w") as f:
                f.write("{}")
        for bad in ("~/dev/homedash/data", "~/dev/homedash/data/config.json",
                    "~/dev/homedash/data/backups/b.json"):
            with self.assertRaises(ValueError, msg=bad):
                localfile.locate(bad)
        self.assertTrue(localfile.locate("~/dev/homedash"))

    def test_file_url_is_understood(self):
        with mock.patch.dict(os.environ, {"HOST_HOME": "/Users/ada"}):
            self.assertTrue(localfile.locate("file:///Users/ada/docs/a.pdf").endswith("/docs/a.pdf"))

    def test_active_content_is_sandboxed_and_pdf_is_not(self):
        html = localfile.headers(f"{self.home}/docs/page.html")
        self.assertIn("sandbox", html["Content-Security-Policy"])
        pdf = localfile.headers(f"{self.home}/docs/a.pdf")
        self.assertEqual(pdf["Content-Type"], "application/pdf")
        self.assertNotIn("Content-Security-Policy", pdf)
        self.assertEqual(localfile.content_type(f"{self.home}/docs/notes.md"), "text/plain; charset=utf-8")

    def test_listing_skips_hidden_entries(self):
        page = localfile.listing(self.home).decode()
        self.assertIn("docs", page)
        self.assertNotIn(".ssh", page)


if __name__ == "__main__":
    unittest.main()
