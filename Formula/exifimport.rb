class Exifimport < Formula
  desc "Ingest media from a memory card into an opinionated date-based directory structure"
  homepage "https://github.com/kindjames/exifimport"
  url "https://github.com/kindjames/exifimport/archive/refs/tags/v0.0.1.tar.gz"
  sha256 "0019dfc4b32d63c1392aa264aed2253c1e0c2fb09216f8e2cc269bbfb8bb49b5"
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
