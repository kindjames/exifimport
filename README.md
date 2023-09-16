# exifimport

Ingests content from a memory card to an opinionated directory structure

```sh
$ exifimport --src kind-sd

```

Can detect if an import may have already occurred.

does file exist in destination?

do any files of the same camera (make, model and name? I have two of the same model camera)

# TODO

- match --src from name of drives / mount points
- get list of external drives and display capactity, name, mount point, disk format etc
- use heuristics to distinguish between memory cards, external hard drives and usb keys
- add functionality to set and read a destination path from config
  - give fatal error when not set with command to issue to set
- add dry Run value
- add progress bar that uses file size as progress indicator
- add hueristics to detect if an import has already occurred by seeing if images already exist in the destination directory (yyyy/yyyy-mm-dd) that have the same serial number in exif tags
- 

How do we know it's an SD Card?
