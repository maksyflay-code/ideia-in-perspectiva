import logo from "@/assets/ivi-logo.png";

export default function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-2" aria-label="IVI Telecom">
      <img src={logo} alt="IVI Telecom" className={compact ? "h-8 w-10 object-contain" : "h-10 w-12 object-contain"} />
      <span className={compact ? "text-base font-bold" : "text-xl font-bold"}>IVI<span className="text-brand-light">Telecom</span></span>
    </div>
  );
}