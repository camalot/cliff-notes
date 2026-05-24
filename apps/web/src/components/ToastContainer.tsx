import { useToastStore } from "@/lib/toast";
import { Toast } from "./ui/Toast";

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed top-3 right-3 z-50 flex flex-col gap-2"
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <Toast {...t} onDismiss={dismiss} />
        </div>
      ))}
    </div>
  );
}
