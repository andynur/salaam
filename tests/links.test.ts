import { expect, test } from "bun:test";
import { collectionCreateInput, linkItemInput } from "../src/modules/links/input";

test("link collections accept school or personal scope", () => {
  expect(collectionCreateInput({ title: "Sistem sekolah", scope: "school" })).toMatchObject({ title: "Sistem sekolah", scope: "school" });
  expect(collectionCreateInput({ title: "Belajar mandiri", scope: "personal" })).toMatchObject({ scope: "personal" });
  expect(() => collectionCreateInput({ title: "Koleksi", scope: "public" })).toThrow();
});
test("link items accept safe HTTP URLs and reject credentials or scripts", () => {
  expect(linkItemInput({ collectionId: crypto.randomUUID(), title: "Portal", url: "https://example.org/login", description: "Masuk" }).url).toBe("https://example.org/login");
  for (const url of ["javascript:alert(1)", "https://user:password@example.org", "ftp://example.org"]) expect(() => linkItemInput({ collectionId: crypto.randomUUID(), title: "Bad", url })).toThrow();
});
