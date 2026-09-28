import { useState } from "react";
import { Eye, EyeOff, LocateFixed } from "lucide-react";
import { QR_TYPE_DEFS, QR_TYPE_MAP } from "../../lib/qrTypes.js";
import { Field, Input, Select, Textarea } from "../ui/Field.jsx";
import { Segmented, Switch } from "../ui/controls.jsx";
import { Button } from "../ui/Button.jsx";
import { cx } from "../../lib/cx.js";

export function TypePicker({ value, onChange, types = QR_TYPE_DEFS }) {
  return (
    <div role="radiogroup" aria-label="QR code type" className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 lg:grid-cols-9">
      {types.map((t) => {
        const active = t.id === value;
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={active}
            title={t.description}
            onClick={() => onChange(t.id)}
            className={cx(
              "group flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 text-xs font-medium transition-all duration-150",
              active
                ? "border-ember-500/60 bg-ember-500/[0.06] text-zinc-900 ring-1 ring-ember-500/30 dark:text-zinc-50"
                : "border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/40",
            )}
          >
            <Icon className={cx("h-4 w-4 transition-colors", active ? "text-ember-500" : "text-zinc-400 group-hover:text-zinc-500")} />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function PasswordInput(props) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      {/* A masked text input rather than type="password": this is a Wi-Fi password to encode,
          not a login, so browsers must not autofill saved site credentials into it. */}
      <Input
        {...props}
        type="text"
        className="pr-10"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        data-1p-ignore
        data-lpignore="true"
        style={visible ? undefined : { WebkitTextSecurity: "disc", textSecurity: "disc" }}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-md p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
        aria-label={visible ? "Hide password" : "Show password"}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function renderControl(field, value, values, set, onBlur) {
  const common = {
    name: field.name,
    value: value ?? "",
    placeholder: field.placeholder,
    autoComplete: field.autoComplete,
    inputMode: field.inputMode,
    onBlur: () => onBlur(field.name),
    onChange: (e) => set(field.name, e.target.value),
  };
  switch (field.type) {
    case "textarea":
      return <Textarea {...common} rows={field.rows ?? 3} />;
    case "password":
      return <PasswordInput {...common} />;
    case "select":
      return (
        <Select {...common}>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      );
    case "datetime-local":
      return <Input {...common} type={field.dateWhen?.(values) ? "date" : "datetime-local"} />;
    default:
      return <Input {...common} type={field.type ?? "text"} spellCheck={field.type === "url" ? false : undefined} />;
  }
}

/**
 * Form for the selected QR type.
 * Errors are only shown for fields the user has interacted with.
 */
export function ContentForm({ type, values, onChange, error, touched, onBlur }) {
  const def = QR_TYPE_MAP[type];
  const set = (name, value) => onChange({ ...values, [name]: value });
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState(null);

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setGeoError("Geolocation isn't available in this browser.");
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onChange({ ...values, mode: "coords", latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) });
      },
      (err) => {
        setLocating(false);
        setGeoError(err.code === 1 ? "Location permission was denied." : "Couldn't determine your location.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {def.fields.map((field) => {
        if (field.hideWhen?.(values)) return null;
        const span = field.span === 2 ? "sm:col-span-2" : "";
        const fieldError = error && error.field === field.name && (touched[field.name] || String(values[field.name] ?? "").trim() !== "") ? error.message : null;
        if (field.type === "switch") {
          return (
            <div key={field.name} className={span}>
              <Switch
                label={field.label}
                description={field.description}
                checked={!!values[field.name]}
                onChange={(v) => set(field.name, v)}
              />
            </div>
          );
        }
        if (field.type === "segmented") {
          return (
            <div key={field.name} className={cx(span, "space-y-1.5")}>
              <span className="block text-[13px] font-medium text-zinc-700 dark:text-zinc-300">{field.label}</span>
              <Segmented label={field.label} value={values[field.name]} options={field.options} onChange={(v) => set(field.name, v)} />
            </div>
          );
        }
        return (
          <Field key={field.name} className={span} label={field.label} optional={field.optional} hint={field.hint} error={fieldError}>
            {renderControl(field, values[field.name], values, set, onBlur)}
          </Field>
        );
      })}
      {type === "location" && values.mode !== "address" && (
        <div className="sm:col-span-2">
          <Button size="sm" variant="secondary" onClick={useMyLocation} loading={locating}>
            {!locating && <LocateFixed className="h-3.5 w-3.5" />}
            Use my current location
          </Button>
          <p className="muted mt-1.5 text-xs">{geoError ?? "Your location is read by your browser and never sent anywhere."}</p>
        </div>
      )}
    </div>
  );
}
