import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import Studio from "../src/pages/Studio.jsx";
import { ThemeProvider } from "../src/lib/theme.jsx";
import { SessionProvider } from "../src/lib/session.jsx";
import { ToastProvider } from "../src/components/ui/overlay.jsx";

function renderStudio() {
  return render(
    <MemoryRouter initialEntries={["/studio"]}>
      <ThemeProvider>
        <SessionProvider>
          <ToastProvider>
            <Studio />
          </ToastProvider>
        </SessionProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // No QRForge server: the Studio must work fully offline.
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("offline"))));
});

describe("Studio", () => {
  it("renders a live preview for the default URL without any server", async () => {
    renderStudio();
    const preview = await screen.findByRole("img", { name: "QR code preview" });
    expect(preview.querySelectorAll("path").length).toBeGreaterThan(0);
    expect(screen.getByText(/Your QR data never leaves your browser/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Download PNG/ }).disabled).toBe(false);
    await waitFor(() => expect(screen.getByText(/Self-host QRForge Server/)).toBeTruthy());
  });

  it("validates Wi-Fi input and only enables export when valid", async () => {
    const user = userEvent.setup();
    renderStudio();
    await user.click(screen.getByRole("radio", { name: /Wi-Fi/ }));
    await user.type(screen.getByLabelText("Network name (SSID)"), "Cafe");
    expect(screen.getByRole("button", { name: /Download PNG/ }).disabled).toBe(true);
    // The password field hasn't been touched, so no inline error yet — but the preview explains.
    expect(screen.queryByText(/is required for secured networks/, { selector: "p[id$='-error']" })).toBeNull();
    const password = screen.getByLabelText("Password");
    expect(password.getAttribute("type")).toBe("text"); // never a login field for password managers
    await user.type(password, "espresso");
    await waitFor(() => expect(screen.getByRole("button", { name: /Download PNG/ }).disabled).toBe(false));
    expect(screen.getByText("Scans reliably")).toBeTruthy();
  });

  it("shows an inline error for an invalid URL", async () => {
    const user = userEvent.setup();
    renderStudio();
    const input = screen.getByLabelText("Website URL");
    await user.clear(input);
    await user.type(input, "not a url");
    expect(await screen.findByText(/"not a url" is not a valid URL/, { selector: "p" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Download PNG/ }).disabled).toBe(true);
  });

  it("warns when a design hurts scan reliability", async () => {
    const user = userEvent.setup();
    renderStudio();
    const fg = screen.getByLabelText("Foreground");
    await user.clear(fg);
    await user.type(fg, "#eeeeee");
    const badge = await screen.findByRole("button", { name: /May not scan/ });
    await user.click(badge);
    expect(within(badge.parentElement).getByText(/very low contrast/)).toBeTruthy();
  });

  it("applies presets", async () => {
    const user = userEvent.setup();
    renderStudio();
    await user.click(screen.getByRole("radio", { name: "Modern" }));
    expect(screen.getByRole("radio", { name: "Modern" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "Dots" }).getAttribute("aria-checked")).toBe("true");
  });
});
