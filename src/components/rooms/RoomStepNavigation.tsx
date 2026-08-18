export type RoomStepKey = "general" | "categoria" | "imagenes" | "contacto" | "records";

const steps: { key: RoomStepKey; label: string; description: string }[] = [
  { key: "general", label: "General", description: "Información básica" },
  { key: "categoria", label: "Juego", description: "Categoría, nivel y más" },
  { key: "imagenes", label: "Imágenes", description: "Card y banner" },
  { key: "contacto", label: "Reserva", description: "Contacto y QR" },
  { key: "records", label: "Récords", description: "Mejores tiempos" },
];

type Props = {
  active: RoomStepKey;
  visited: RoomStepKey[];
  onChange: (step: RoomStepKey) => void;
};

export default function RoomStepNavigation({ active, visited, onChange }: Props) {
  return (
    <nav className="eg-room-steps" aria-label="Pasos del formulario">
      {steps.map((step, index) => {
        const isActive = active === step.key;
        const isVisited = visited.includes(step.key);
        return (
          <button
            key={step.key}
            type="button"
            className={`eg-room-step${isActive ? " is-active" : ""}${isVisited ? " is-visited" : ""}`}
            aria-current={isActive ? "step" : undefined}
            onClick={() => onChange(step.key)}
          >
            <span className="eg-room-step__rail" aria-hidden="true">
              <span className="eg-room-step__dot">{isVisited && !isActive ? "✓" : index + 1}</span>
            </span>
            <span className="eg-room-step__copy">
              <strong>{step.label}</strong>
              <span>{step.description}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
