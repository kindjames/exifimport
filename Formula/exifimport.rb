class Exifimport < Formula
  desc "Ingest media from a memory card into an opinionated date-based directory structure"
  homepage "https://github.com/kindjames/exifimport"
  url "https://github.com/kindjames/exifimport/archive/refs/tags/v0.0.1.tar.gz"
  sha256 "eab2a609b189359e73e43b1194e9b5496c75d9b2f9e7d2a4c8fca2bce75c67fd"
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
