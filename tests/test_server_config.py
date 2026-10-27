"""PUT /api/config : une écriture faite sur une version périmée est refusée."""

import http.client
import json
import threading
import unittest
from http.server import ThreadingHTTPServer

from tests import _path  # (DATA_DIR temporaire avant tout import du backend)

import server
import store

BASE = {"title": "t", "groups": [{"name": "Liens", "links": [{"name": "A", "url": "https://a.test"}]}]}


class ConfigVersionTest(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.port = cls.srv.server_address[1]
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.srv.server_close()

    def setUp(self):
        store.write(store.CONFIG, BASE)

    def call(self, method, body=None, version=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        headers = {"Host": "localhost"}
        data = None
        if body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        if version is not None:
            headers["X-Config-Version"] = version
        c.request(method, "/api/config", body=data, headers=headers)
        r = c.getresponse()
        payload = json.loads(r.read() or b"null")
        c.close()
        return r.status, payload, r.getheader("X-Config-Version")

    def test_get_gives_the_version(self):
        status, cfg, ver = self.call("GET")
        self.assertEqual(status, 200)
        self.assertEqual(cfg["title"], "t")
        self.assertEqual(ver, store.version(store.CONFIG))

    def test_save_on_current_version_then_stale_one_is_refused(self):
        _, _, v1 = self.call("GET")
        status, out, v2 = self.call("PUT", {**BASE, "title": "onglet 1"}, v1)
        self.assertEqual(status, 200)
        self.assertNotEqual(v2, v1)
        self.assertEqual(out["version"], v2)
        # Deuxième onglet, chargé avant : il ne doit pas écraser le premier.
        status, out, _ = self.call("PUT", {**BASE, "title": "onglet 2"}, v1)
        self.assertEqual(status, 409)
        self.assertTrue(out["conflict"])
        self.assertEqual(store.read(store.CONFIG, {})["title"], "onglet 1")

    def test_without_version_header_it_writes_as_before(self):
        status, _, _ = self.call("PUT", {**BASE, "title": "script"})
        self.assertEqual(status, 200)
        self.assertEqual(store.read(store.CONFIG, {})["title"], "script")


if __name__ == "__main__":
    unittest.main()


class FeaturesTest(unittest.TestCase):
    """Réglages → Fonctionnalités : une fonctionnalité coupée ne lit plus rien."""

    def tearDown(self):
        store.write(store.CONFIG, BASE)
        server.load_sections()

    def test_local_switched_off_then_on(self):
        import basecamp
        import localgit
        local = {"roots": [{"path": str(_path.DATA_DIR)}]}
        store.write(store.CONFIG, {**BASE, "local": local, "features": {"local": False, "basecamp": False}})
        server.load_sections()
        self.assertFalse(localgit.enabled())
        self.assertFalse(basecamp._on[0])
        self.assertIn("Fonctionnalités", localgit.payload()["error"])
        store.write(store.CONFIG, {**BASE, "local": local})
        server.load_sections()
        self.assertTrue(localgit.CFG["enabled"])
        self.assertTrue(basecamp._on[0])

    def test_trello_switched_off_then_on(self):
        import trello
        store.write(store.CONFIG, {**BASE, "features": {"trello": False}})
        server.load_sections()
        self.assertFalse(trello._on[0])
        store.write(store.CONFIG, BASE)
        server.load_sections()
        self.assertTrue(trello._on[0])
