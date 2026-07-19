import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

if (process.platform !== "darwin") {
  process.exit(0);
}

const repositoryRoot = process.cwd();
const tauriConfig = JSON.parse(
  readFileSync(join(repositoryRoot, "apps", "desktop", "src-tauri", "tauri.conf.json"), "utf8")
);
const productName = tauriConfig.productName;
const version = tauriConfig.version;
const releaseArchitecture = process.arch === "arm64" ? "aarch64" : process.arch;
const bundleRoot = join(
  repositoryRoot,
  "apps",
  "desktop",
  "src-tauri",
  "target",
  "release",
  "bundle"
);
const applicationPath = join(bundleRoot, "macos", `${productName}.app`);
const diskImagePath = join(
  bundleRoot,
  "dmg",
  `${productName}_${version}_${releaseArchitecture}.dmg`
);

if (!existsSync(applicationPath)) {
  throw new Error(`macOS application bundle not found: ${applicationPath}`);
}

function run(executable, args, options = {}) {
  execFileSync(executable, args, { stdio: "inherit", ...options });
}

const stagingDirectory = mkdtempSync(join(tmpdir(), "aerocel-forge-release-"));
const mountDirectory = mkdtempSync(join(tmpdir(), "aerocel-forge-mount-"));
const verifiedApplicationPath = join(bundleRoot, "macos", `${productName}.verified.app`);
const replacedApplicationPath = join(bundleRoot, "macos", `${productName}.replaced.app`);
let mounted = false;

try {
  const stagedApplicationPath = join(stagingDirectory, `${productName}.app`);

  // Cloud-backed workspaces can attach Finder/resource-fork metadata after
  // Tauri signs the bundle. Sign a metadata-free temporary copy, then copy the
  // sealed app back without extended attributes.
  run("ditto", ["--norsrc", "--noextattr", applicationPath, stagedApplicationPath]);
  run("xattr", ["-cr", stagedApplicationPath]);
  run("codesign", [
    "--force",
    "--deep",
    "--sign",
    "-",
    "--options",
    "runtime",
    stagedApplicationPath
  ]);
  run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", stagedApplicationPath]);

  rmSync(verifiedApplicationPath, { recursive: true, force: true });
  rmSync(replacedApplicationPath, { recursive: true, force: true });
  run("ditto", ["--norsrc", "--noextattr", stagedApplicationPath, verifiedApplicationPath]);
  run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", verifiedApplicationPath]);
  renameSync(applicationPath, replacedApplicationPath);
  try {
    renameSync(verifiedApplicationPath, applicationPath);
  } catch (replacementError) {
    try {
      renameSync(replacedApplicationPath, applicationPath);
    } catch (restorationError) {
      throw new AggregateError(
        [replacementError, restorationError],
        `Could not install or restore the verified application bundle; recovery copy remains at ${replacedApplicationPath}`
      );
    }
    throw replacementError;
  }
  rmSync(replacedApplicationPath, { recursive: true, force: true });
  run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", applicationPath]);

  symlinkSync("/Applications", join(stagingDirectory, "Applications"));

  run("hdiutil", [
    "create",
    "-volname",
    productName,
    "-srcfolder",
    stagingDirectory,
    "-ov",
    "-format",
    "UDZO",
    diskImagePath
  ]);
  run("hdiutil", ["verify", diskImagePath]);
  run("hdiutil", [
    "attach",
    "-nobrowse",
    "-readonly",
    "-mountpoint",
    mountDirectory,
    diskImagePath
  ]);
  mounted = true;
  run("codesign", [
    "--verify",
    "--deep",
    "--strict",
    "--verbose=2",
    join(mountDirectory, `${productName}.app`)
  ]);
} finally {
  if (mounted) {
    run("hdiutil", ["detach", mountDirectory]);
  }
  rmSync(verifiedApplicationPath, { recursive: true, force: true });
  rmSync(stagingDirectory, { recursive: true, force: true });
  rmSync(mountDirectory, { recursive: true, force: true });
}
