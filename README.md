# exifimport

Ingests media from a memory card into an opinionated date-based directory structure using EXIF metadata.

Files are organised as:

```
destination/
  photo/
    2024/
      2024-03-15/
        IMG_1234.jpg
  video/
    2024/
      2024-03-15/
        MVI_5678.mp4
```

## Install

```sh
brew tap kindjames/tap
brew install exifimport
```

## Usage

```sh
exifimport --source /Volumes/CARD --destination ~/Pictures
```

| Flag | Alias | Description | Default |
|---|---|---|---|
| `--source` | `-s`, `--src` | Path to search for files | current directory |
| `--destination` | `-d`, `--dest` | Where files will be transferred | config file value |
| `--extensions` | | File types to import | all supported types |
| `--overwrite` | | Overwrite files that already exist | `false` |

When a file already exists and `--overwrite` is not set, you will be prompted:

```
File already exists: IMG_1234.jpg
[r]eplace, [R]eplace all, [s]kip, [S]kip all, [a]bort:
```

## Releasing a new version

1. Bump the version in `package.json`
2. Commit, tag, and push:
   ```sh
   git add package.json
   git commit -m "Bump version to vX.X.X"
   git tag vX.X.X
   git push origin main && git push origin vX.X.X
   ```
3. Get the sha256 of the new release tarball:
   ```sh
   curl -sL https://github.com/kindjames/exifimport/archive/refs/tags/vX.X.X.tar.gz | shasum -a 256
   ```
4. Update `Formula/exifimport.rb` in both this repo and `kindjames/homebrew-tap` with the new tag URL and sha256

## Configuration

Create `~/.exifimport.toml` to set defaults:

```toml
destination = "/Volumes/NAS/Photos"
```
