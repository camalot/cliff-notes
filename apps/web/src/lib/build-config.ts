import rootPkg from "../../../../package.json";

const cn = (rootPkg as { cliffNotes?: { hashSeed?: string } }).cliffNotes;

if (!cn?.hashSeed || typeof cn.hashSeed !== "string") {
  throw new Error(
    "package.json `cliffNotes.hashSeed` is missing or not a string. " +
      "Add it before building — the integrity hash depends on it.",
  );
}

export const HASH_SEED: string = cn.hashSeed;
