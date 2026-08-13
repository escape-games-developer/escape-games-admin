type Props = {
  title: string;
  subtitle?: string;
  /** Acción primaria de la pantalla (normalmente un <Button variant="primary" />). */
  action?: React.ReactNode;
};

/**
 * Encabezado de sección: título, subtítulo y la acción principal a la derecha.
 * El breadcrumb NO vive acá — vive en el topbar, como en el mockup.
 */
export default function PageHeader({ title, subtitle, action }: Props) {
  return (
    <header className="eg-pagehead">
      <div className="eg-pagehead__text">
        <h1 className="eg-pagehead__title">{title}</h1>
        {subtitle && <p className="eg-pagehead__sub">{subtitle}</p>}
      </div>

      {action && <div className="eg-pagehead__action">{action}</div>}
    </header>
  );
}
