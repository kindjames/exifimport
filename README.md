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

## Configuration

Create `~/.exifimport.toml` to set defaults:

```toml
destination = "/Volumes/NAS/Photos"
```
