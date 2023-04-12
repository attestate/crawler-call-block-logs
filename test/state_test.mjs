//@format
import { rm } from "fs/promises";

import test from "ava";
import { open } from "lmdb";

import { state, loader } from "../src/index.mjs";

test("retrieving last value from local db", async (t) => {
  let key = ["0x103c8ce", "0xac"];
  key = loader.serialize(key);
  const value = "0xab";

  const path = "./testdb";
  const db = new open({ path });
  await db.put(key, value);

  const result = await state.local(db);
  t.is(result, 17025230);

  await rm(path, { recursive: true });
});
