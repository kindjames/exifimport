class Exifimport < Formula
  desc "Ingest media from a memory card into an opinionated date-based directory structure"
  homepage "https://github.com/kindjames/exifimport"
  url "https://github.com/kindjames/exifimport/archive/refs/tags/v0.0.2.tar.gz"
  sha256 "4d48f91ec0c82fe6a93fe00bcc897aea1c134233d35febb6140306629a2963bc"
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
