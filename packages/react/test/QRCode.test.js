import { describe, it, expect, vi, afterEach } from "vitest";
import { createElement as h, createRef } from "react";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { toSVG, layoutQR, rasterize } from "@qrforge/core";
import jsQR from "jsqr";
import { QRCode, QRDownloadButton, useQRCode, toCoreOptions } from "../src/index.js";

afterEach(cleanup);

const URL_VALUE = "https://example.com";

function decodeOptions(options) {
  const px = rasterize(layoutQR(options).layout);
  return jsQR(new Uint8ClampedArray(px.data), px.width, px.height)?.data ?? null;
}

describe("QRCode", () => {
  it("renders an accessible inline SVG at the requested size", () => {
    render(h(QRCode, { value: URL_VALUE, size: 300 }));
    const svg = screen.getByRole("img", { name: "QR code" });
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(svg.getAttribute("width")).toBe("300");
    expect(svg.querySelectorAll("path").length).toBeGreaterThan(1);
  });

  it("draws exactly the same geometry as @qrforge/core's SVG renderer", () => {
    const { container } = render(h(QRCode, { value: URL_VALUE, size: 256 }));
    const reactPaths = [...container.querySelectorAll("path")].map((p) => p.getAttribute("d"));
    const coreSvg = toSVG({ data: URL_VALUE, size: 256 });
    const corePaths = [...coreSvg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
    expect(reactPaths).toEqual(corePaths);
  });

  it("maps friendly prop aliases and presets to core options", () => {
    const opts = toCoreOptions({ value: "x", fgColor: "#111111", bgColor: "#eeeeee", errorCorrection: "H", preset: "modern" });
    expect(opts).toMatchObject({ data: "x", foreground: "#111111", background: "#eeeeee", ecc: "H", moduleStyle: "dots", size: 256 });
    expect(decodeOptions({ ...opts, size: 400 })).toBe("x");
  });

  it("supports structured types", () => {
    const { container } = render(h(QRCode, { type: "wifi", data: { ssid: "Cafe", password: "latte123" }, title: "Wi-Fi" }));
    expect(container.querySelector("title").textContent).toBe("Wi-Fi");
    expect(decodeOptions(toCoreOptions({ type: "wifi", data: { ssid: "Cafe", password: "latte123" }, size: 300 }))).toBe(
      "WIFI:T:WPA;S:Cafe;P:latte123;;",
    );
  });

  it("renders labels, logos and passes through extra SVG props", () => {
    const { container } = render(
      h(QRCode, {
        value: URL_VALUE,
        ecc: "H",
        label: "Scan me",
        frame: "banner",
        logo: { src: "data:image/png;base64,iVBORw0KGgo=" },
        "data-testid": "qr",
        className: "my-qr",
      }),
    );
    const svg = screen.getByTestId("qr");
    expect(svg.getAttribute("class")).toBe("my-qr");
    expect(container.querySelector("text").textContent).toBe("Scan me");
    expect(container.querySelector("image").getAttribute("href")).toMatch(/^data:image\/png/);
  });

  it("renders the fallback and reports errors for invalid input", async () => {
    const onError = vi.fn();
    render(h(QRCode, { value: "", onError, fallback: h("span", null, "nothing to show") }));
    expect(screen.getByText("nothing to show")).toBeTruthy();
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onError.mock.calls[0][0].code).toBe("EMPTY_DATA");
  });

  it("exposes imperative helpers through ref", async () => {
    const ref = createRef();
    render(h(QRCode, { value: URL_VALUE, ref }));
    const svg = await ref.current.toSVG();
    expect(svg.startsWith("<svg")).toBe(true);
    const dataUrl = await ref.current.toDataURL("svg");
    expect(dataUrl).toMatch(/^data:image\/svg\+xml;base64,/);
  });
});

describe("useQRCode", () => {
  it("returns the layout, matrix and reliability", () => {
    let result;
    function Probe() {
      result = useQRCode({ value: URL_VALUE, foreground: "#dddddd" });
      return null;
    }
    render(h(Probe));
    expect(result.matrix.version).toBe(2);
    expect(result.layout.pixelWidth).toBe(256);
    expect(result.reliability.level).toBe("poor");
    expect(result.reliability.warnings[0].code).toBe("LOW_CONTRAST");
  });
});

describe("QRDownloadButton", () => {
  it("downloads a generated file", async () => {
    const createObjectURL = vi.fn(() => "blob:qr");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const onDownload = vi.fn();
    render(h(QRDownloadButton, { value: URL_VALUE, format: "svg", filename: "site", onDownload }, "Get SVG"));
    fireEvent.click(screen.getByRole("button", { name: "Get SVG" }));
    await waitFor(() => expect(onDownload).toHaveBeenCalledWith("svg"));
    expect(click).toHaveBeenCalled();
    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe("image/svg+xml");
    expect(await blob.text()).toMatch(/^<svg/);
    click.mockRestore();
    vi.unstubAllGlobals();
  });
});
