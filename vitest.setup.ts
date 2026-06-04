import os from "os";
import path from "path";
import { mkdtempSync } from "fs";

// Isolate the storage data root to a temp dir by default, so ANY test that
// writes a page — which now also writes the commons index, per-tenant silos
// (tenants/<tenant>/…), and .indexes — never touches the repo cwd. Tests that
// set their own DATA_DIR/WIKI_DIR/RAW_DIR in beforeEach still override this.
if (!process.env.DATA_DIR) {
  process.env.DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "yopedia-test-"));
}
