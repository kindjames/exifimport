class Exifimport < Formula
  desc "Ingest media from a memory card into an opinionated date-based directory structure"
  homepage "https://github.com/kindjames/exifimport"
  url "https://github.com/kindjames/exifimport/archive/refs/tags/v0.0.3.tar.gz"
  sha256 "7166bf36c61e065e16aadded06f8f126d7ea1ede9b7cef4d7c11e055468da3d6"
  license "ISC"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match "source", shell_output("#{bin}/exifimport --help")
  end
end
