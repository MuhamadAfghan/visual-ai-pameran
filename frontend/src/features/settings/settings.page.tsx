import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail, Database, Camera, Bell, Trash2, Send, Eye, EyeOff, HardDrive } from "lucide-react";
import { PageHeader } from "../../components/page-header";
import {
  getSettings,
  getStorageStats,
  updateSettings,
  testSmtp,
  runCleanup,
  type SettingsPayload
} from "../../services/settings.service";
import { useUiStore } from "../../store/ui.store";

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  description,
  children
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-6 border bg-surface-panel border-surface-border rounded-xl">
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 rounded-lg bg-primary/10">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-content">{title}</h2>
          <p className="text-xs text-content-muted">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

// ─── Field helpers ────────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className={lbl}>{label}</label>
      {children}
      {hint && <p className="text-[11px] text-content-muted mt-1">{hint}</p>}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const qc = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
    staleTime: 60_000
  });

  // Local form state for each section
  const [smtp, setSmtp] = useState({
    host: "",
    port: 587,
    user: "",
    pass: "",
    from: "",
    tls: false
  });
  const [retention, setRetention] = useState({ dataDays: 30, snapshotDays: 7 });
  const [capture, setCapture] = useState({ defaultInterval: 30, defaultCooldown: 300 });
  const [notification, setNotification] = useState({ maxEmailsPerHour: 10, cooldownMinutes: 5 });
  const [storage, setStorage] = useState({ maxSizeGB: 10 });
  const [showPass, setShowPass] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);

  const { data: storageStats } = useQuery({
    queryKey: ["storage-stats"],
    queryFn: getStorageStats,
    refetchInterval: 30_000
  });

  useEffect(() => {
    if (!settings) return;
    setSmtp({
      host: settings.smtp?.host ?? "",
      port: settings.smtp?.port ?? 587,
      user: settings.smtp?.user ?? "",
      pass: settings.smtp?.pass ?? "",
      from: settings.smtp?.from ?? "",
      tls: settings.smtp?.tls ?? false
    });
    setRetention({
      dataDays: settings.retention?.dataDays ?? 30,
      snapshotDays: settings.retention?.snapshotDays ?? 7
    });
    setCapture({
      defaultInterval: settings.capture?.defaultInterval ?? 30,
      defaultCooldown: settings.capture?.defaultCooldown ?? 300
    });
    setNotification({
      maxEmailsPerHour: settings.notification?.maxEmailsPerHour ?? 10,
      cooldownMinutes: settings.notification?.cooldownMinutes ?? 5
    });
    setStorage({ maxSizeGB: settings.storage?.maxSizeGB ?? 10 });
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (payload: SettingsPayload) => updateSettings(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      addToast({ type: "success", message: "Pengaturan berhasil disimpan" });
    },
    onError: () => addToast({ type: "error", message: "Gagal menyimpan pengaturan" })
  });

  function handleSave() {
    const payload: SettingsPayload = {
      smtp: { ...smtp, pass: smtp.pass === "••••" ? undefined : smtp.pass || undefined },
      retention,
      capture,
      notification,
      storage
    };
    saveMutation.mutate(payload);
  }

  async function handleTestSmtp() {
    if (!testEmail) return;
    setTestingSmtp(true);
    try {
      const res = await testSmtp(testEmail);
      addToast({ type: "success", message: res.message });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Gagal kirim test email";
      addToast({ type: "error", message: msg });
    } finally {
      setTestingSmtp(false);
    }
  }

  async function handleCleanup() {
    setCleaningUp(true);
    try {
      const res = await runCleanup();
      addToast({ type: "success", message: `${res.message} — ${res.deleted ?? 0} item dihapus` });
    } catch {
      addToast({ type: "error", message: "Gagal menjalankan cleanup" });
    } finally {
      setCleaningUp(false);
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="w-48 h-8 rounded bg-surface-elevated animate-pulse" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-40 border bg-surface-panel border-surface-border rounded-xl animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 ">
      <PageHeader
        title="System Settings"
        description="Konfigurasi SMTP, retensi data, dan notifikasi"
      />

      {/* SMTP */}
      <Section
        icon={Mail}
        title="SMTP"
        description="Konfigurasi email untuk notifikasi pelanggaran"
      >
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="Host">
                <input
                  className={inp}
                  value={smtp.host}
                  onChange={(e) => setSmtp((s) => ({ ...s, host: e.target.value }))}
                  placeholder="smtp.gmail.com"
                />
              </Field>
            </div>
            <Field label="Port">
              <input
                type="number"
                className={inp}
                value={smtp.port}
                onChange={(e) => setSmtp((s) => ({ ...s, port: Number(e.target.value) }))}
                placeholder="587"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Username / Email">
              <input
                className={inp}
                value={smtp.user}
                onChange={(e) => setSmtp((s) => ({ ...s, user: e.target.value }))}
                placeholder="user@gmail.com"
              />
            </Field>
            <Field label="Password">
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  className={`${inp} pr-9`}
                  value={smtp.pass}
                  onChange={(e) => setSmtp((s) => ({ ...s, pass: e.target.value }))}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-content-muted hover:text-content"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="From (alamat pengirim)">
              <input
                className={inp}
                value={smtp.from}
                onChange={(e) => setSmtp((s) => ({ ...s, from: e.target.value }))}
                placeholder="noreply@company.com"
              />
            </Field>
            <Field label="&nbsp;">
              <label className="flex items-center gap-2 h-[38px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={smtp.tls}
                  onChange={(e) => setSmtp((s) => ({ ...s, tls: e.target.checked }))}
                  className="rounded border-surface-border"
                />
                <span className="text-sm text-content">Gunakan TLS</span>
              </label>
            </Field>
          </div>

          {/* Test email */}
          <div className="pt-2 border-t border-surface-border">
            <p className="mb-2 text-xs text-content-muted">
              Kirim test email untuk verifikasi konfigurasi
            </p>
            <div className="flex gap-2">
              <input
                className={`${inp} flex-1`}
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="test@example.com"
                type="email"
              />
              <button
                type="button"
                onClick={handleTestSmtp}
                disabled={!testEmail || testingSmtp}
                className="flex items-center gap-1.5 px-3 py-2 text-xs border border-surface-border rounded-lg text-content-secondary hover:bg-surface-elevated disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5" />
                {testingSmtp ? "Mengirim..." : "Test Kirim"}
              </button>
            </div>
          </div>
        </div>
      </Section>

      {/* Retention */}
      <Section
        icon={Database}
        title="Retensi Data"
        description="Berapa lama data events dan snapshot disimpan"
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Retensi Data Events (hari)" hint="Events detection dan violation">
            <input
              type="number"
              min={1}
              className={inp}
              value={retention.dataDays}
              onChange={(e) => setRetention((s) => ({ ...s, dataDays: Number(e.target.value) }))}
            />
          </Field>
          <Field label="Retensi Snapshot Evidence (hari)" hint="File gambar bukti pelanggaran">
            <input
              type="number"
              min={1}
              className={inp}
              value={retention.snapshotDays}
              onChange={(e) =>
                setRetention((s) => ({ ...s, snapshotDays: Number(e.target.value) }))
              }
            />
          </Field>
        </div>
      </Section>

      {/* Capture defaults */}
      <Section icon={Camera} title="Default Capture" description="Nilai default untuk kamera baru">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Interval Capture (detik)" hint="Seberapa sering snapshot diambil">
            <input
              type="number"
              min={5}
              className={inp}
              value={capture.defaultInterval}
              onChange={(e) =>
                setCapture((s) => ({ ...s, defaultInterval: Number(e.target.value) }))
              }
            />
          </Field>
          <Field
            label="Cooldown Notifikasi (detik)"
            hint="Jeda minimum antar notifikasi per kamera"
          >
            <input
              type="number"
              min={0}
              className={inp}
              value={capture.defaultCooldown}
              onChange={(e) =>
                setCapture((s) => ({ ...s, defaultCooldown: Number(e.target.value) }))
              }
            />
          </Field>
        </div>
      </Section>

      {/* Notification */}
      <Section icon={Bell} title="Notifikasi Email" description="Batas pengiriman email notifikasi">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Maks Email per Jam">
            <input
              type="number"
              min={1}
              className={inp}
              value={notification.maxEmailsPerHour}
              onChange={(e) =>
                setNotification((s) => ({ ...s, maxEmailsPerHour: Number(e.target.value) }))
              }
            />
          </Field>
          <Field label="Cooldown antar Notifikasi (menit)">
            <input
              type="number"
              min={0}
              className={inp}
              value={notification.cooldownMinutes}
              onChange={(e) =>
                setNotification((s) => ({ ...s, cooldownMinutes: Number(e.target.value) }))
              }
            />
          </Field>
        </div>
      </Section>

      {/* Storage */}
      <Section icon={HardDrive} title="Storage" description="Batas maksimal ukuran penyimpanan file bukti">
        <div className="space-y-4">
          <Field label="Maks Ukuran Storage (GB)" hint="Batas total penyimpanan folder evidence">
            <input
              type="number"
              min={0.1}
              step={0.5}
              className={inp}
              value={storage.maxSizeGB}
              onChange={(e) => setStorage({ maxSizeGB: Number(e.target.value) })}
            />
          </Field>
          {storageStats && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-content-secondary">
                <span>{storageStats.usedGB.toFixed(2)} GB digunakan</span>
                <span>{storageStats.maxSizeGB} GB maks · {storageStats.percentUsed}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-surface-elevated overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${storageStats.percentUsed >= 90 ? "bg-red-500" : storageStats.percentUsed >= 70 ? "bg-amber-500" : "bg-primary"}`}
                  style={{ width: `${Math.min(100, storageStats.percentUsed)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* Actions */}
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={handleCleanup}
          disabled={cleaningUp}
          className="flex items-center gap-2 px-4 py-2 text-sm text-red-500 transition-colors border rounded-lg border-red-500/30 hover:bg-red-500/10 disabled:opacity-40"
        >
          <Trash2 className="w-4 h-4" />
          {cleaningUp ? "Membersihkan..." : "Cleanup Manual"}
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="px-5 py-2 text-sm font-medium transition-opacity rounded-lg bg-primary text-primary-fg hover:opacity-90 disabled:opacity-50"
        >
          {saveMutation.isPending ? "Menyimpan..." : "Simpan Perubahan"}
        </button>
      </div>
    </div>
  );
}

const lbl = "block text-sm font-medium text-content-secondary mb-1.5";
const inp =
  "w-full px-3 py-2 text-sm border border-surface-border bg-surface-elevated text-content rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors placeholder:text-content-muted";
