import { useState, useEffect, useRef } from "react";
import Head from "next/head";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Chip } from "@heroui/chip";
import { Tooltip } from "@heroui/tooltip";
import { QRCodeSVG, QRCodeCanvas } from "qrcode.react";

import AdminLayout from "@/layouts/admin";
import { toast } from "@/lib/toast";

export default function AppQRPage() {
  const [downloadUrl, setDownloadUrl] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    setDownloadUrl(`${base}/download`);
  }, []);

  const activeUrl = useCustom && customUrl.trim() ? customUrl.trim() : downloadUrl;

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(activeUrl);
      setCopied(true);
      toast.success("URL copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy URL");
    }
  };

  const handleDownloadPNG = () => {
    // Find the hidden canvas rendered by QRCodeCanvas
    const canvas = canvasRef.current?.querySelector("canvas");
    if (!canvas) {
      toast.error("Could not find QR canvas");
      return;
    }
    const link = document.createElement("a");
    link.download = "airat-na-app-qr.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const handleDownloadSVG = () => {
    const svg = document.getElementById("qr-svg");
    if (!svg) {
      toast.error("Could not find QR SVG");
      return;
    }
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svg);
    const blob = new Blob([svgStr], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = "airat-na-app-qr.svg";
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminLayout>
      <Head>
        <title>App QR Code — AIRAT-NA Admin</title>
      </Head>

      <div className="mx-auto max-w-3xl space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-xl font-semibold" style={{ color: "var(--text-strong)" }}>
            App QR Code
          </h2>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Print or share this QR code so users can scan it and download the AIRAT-NA app on their phone.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* QR Preview */}
          <Card className="glass-card">
            <CardHeader>
              <h3 className="font-semibold" style={{ color: "var(--text-strong)" }}>
                QR Preview
              </h3>
            </CardHeader>
            <CardBody className="flex flex-col items-center gap-6">
              {/* Visible SVG QR */}
              <div
                className="rounded-2xl p-5 shadow-lg"
                style={{ background: "#ffffff" }}
              >
                <QRCodeSVG
                  id="qr-svg"
                  value={activeUrl || "https://example.com"}
                  size={220}
                  level="H"
                  includeMargin={false}
                  imageSettings={{
                    src: "/android-chrome-192x192.png",
                    x: undefined,
                    y: undefined,
                    height: 40,
                    width: 40,
                    excavate: true,
                  }}
                />
              </div>

              {/* Hidden canvas for PNG export */}
              <div ref={canvasRef} style={{ display: "none" }}>
                <QRCodeCanvas
                  value={activeUrl || "https://example.com"}
                  size={512}
                  level="H"
                  includeMargin
                  imageSettings={{
                    src: "/android-chrome-192x192.png",
                    x: undefined,
                    y: undefined,
                    height: 88,
                    width: 88,
                    excavate: true,
                  }}
                />
              </div>

              <div className="w-full text-center space-y-1">
                <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  Points to:
                </p>
                <p
                  className="text-xs break-all rounded-lg px-3 py-2"
                  style={{
                    color: "var(--text-strong)",
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {activeUrl}
                </p>
              </div>

              {/* Download buttons */}
              <div className="flex w-full gap-2">
                <Tooltip
                  classNames={{ content: "bg-slate-800 text-white border border-white/10 shadow-lg text-xs" }}
                  content="Download high-resolution PNG (512×512)"
                  delay={700}
                  showArrow
                  placement="bottom"
                >
                  <Button
                    size="sm"
                    variant="flat"
                    className="flex-1"
                    onPress={handleDownloadPNG}
                    startContent={
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    }
                  >
                    PNG
                  </Button>
                </Tooltip>
                <Tooltip
                  classNames={{ content: "bg-slate-800 text-white border border-white/10 shadow-lg text-xs" }}
                  content="Download vector SVG (scalable, best for print)"
                  delay={700}
                  showArrow
                  placement="bottom"
                >
                  <Button
                    size="sm"
                    variant="flat"
                    className="flex-1"
                    onPress={handleDownloadSVG}
                    startContent={
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    }
                  >
                    SVG
                  </Button>
                </Tooltip>
              </div>
            </CardBody>
          </Card>

          {/* Configuration */}
          <Card className="glass-card">
            <CardHeader>
              <h3 className="font-semibold" style={{ color: "var(--text-strong)" }}>
                Configuration
              </h3>
            </CardHeader>
            <CardBody className="space-y-5">
              {/* Default URL */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium" style={{ color: "var(--text-strong)" }}>
                    Default download page
                  </label>
                  <Chip
                    size="sm"
                    color={useCustom ? "default" : "success"}
                    variant="flat"
                    className="cursor-pointer"
                    onClick={() => setUseCustom(false)}
                  >
                    {useCustom ? "inactive" : "active"}
                  </Chip>
                </div>
                <div
                  className="flex items-center gap-2 rounded-lg px-3 py-2.5"
                  style={{
                    background: "var(--bg-elevated)",
                    border: `1px solid ${useCustom ? "var(--border)" : "var(--success)"}`,
                  }}
                >
                  <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    style={{ color: "var(--text-muted)" }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  <span className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                    {downloadUrl || "Loading…"}
                  </span>
                </div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  The <code className="text-xs">/download</code> page auto-detects the user&apos;s OS and
                  shows the right download option (Android APK, Play Store, or App Store).
                </p>
              </div>

              {/* Custom URL override */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium" style={{ color: "var(--text-strong)" }}>
                    Custom URL override
                  </label>
                  <Chip
                    size="sm"
                    color={useCustom ? "primary" : "default"}
                    variant="flat"
                    className="cursor-pointer"
                    onClick={() => {
                      if (customUrl.trim()) setUseCustom(true);
                    }}
                  >
                    {useCustom ? "active" : "inactive"}
                  </Chip>
                </div>
                <Input
                  size="sm"
                  placeholder="https://your-custom-link.com/download"
                  value={customUrl}
                  onValueChange={(v) => {
                    setCustomUrl(v);
                    setUseCustom(v.trim().length > 0);
                  }}
                  startContent={
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      style={{ color: "var(--text-muted)" }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  }
                />
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Useful for pointing directly to a GitHub release APK or a custom landing page.
                  Leave empty to use the default download page.
                </p>
              </div>

              {/* Copy URL */}
              <div className="pt-2">
                <Button
                  size="sm"
                  color={copied ? "success" : "primary"}
                  variant="flat"
                  className="w-full"
                  onPress={handleCopyUrl}
                  startContent={
                    copied ? (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    )
                  }
                >
                  {copied ? "Copied!" : "Copy active URL"}
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Usage tips */}
        <Card className="glass-card">
          <CardBody>
            <h3 className="font-semibold mb-3" style={{ color: "var(--text-strong)" }}>
              Usage tips
            </h3>
            <ul className="space-y-2 text-sm" style={{ color: "var(--text-muted)" }}>
              <li className="flex items-start gap-2">
                <svg className="h-4 w-4 mt-0.5 flex-shrink-0 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Download the <strong>SVG</strong> for posters, flyers, or any print material — it scales to any size without losing quality.
              </li>
              <li className="flex items-start gap-2">
                <svg className="h-4 w-4 mt-0.5 flex-shrink-0 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Download the <strong>PNG (512×512)</strong> for digital use — social media posts, screens, email.
              </li>
              <li className="flex items-start gap-2">
                <svg className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                The QR encodes the full absolute URL. If you change domains, regenerate the QR by refreshing this page.
              </li>
              <li className="flex items-start gap-2">
                <svg className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                The download page (<code className="text-xs">/download</code>) detects Android / iOS automatically and highlights the
                correct button for each visitor.
              </li>
            </ul>
          </CardBody>
        </Card>
      </div>
    </AdminLayout>
  );
}
