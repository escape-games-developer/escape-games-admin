import { promotionGrantQrValue, promotionUseQrValue } from "../../lib/promotions";
import PromotionQrBlock from "./PromotionQrBlock";

type Props = {
  /** Tokens PUROS: el prefijo del QR se agrega acá, no se persiste. */
  grantToken: string | null;
  useToken: string | null;
  promotionName?: string;
  /** Muestra los botones de impresión. */
  printable?: boolean;
  loading?: boolean;
  onRotateGrant?: () => void;
  onRotateUse?: () => void;
  rotating?: "grant" | "use" | null;
  onError?: (msg: string) => void;
};

/** Los dos QR de una promoción: otorgar y usar. Se rotan por separado. */
export default function PromotionQrPair({
  grantToken,
  useToken,
  promotionName,
  printable = false,
  loading = false,
  onRotateGrant,
  onRotateUse,
  rotating = null,
  onError,
}: Props) {
  return (
    <div className="eg-promo-qr-pair">
      <div className="eg-promo-qr-pair__grid">
        <PromotionQrBlock
          title="QR para otorgar"
          description="El cliente escanea este QR desde la app para obtener la promoción."
          value={promotionGrantQrValue(grantToken)}
          promotionName={promotionName}
          printLabel={printable ? "Imprimir QR otorgar" : undefined}
          rotateLabel={onRotateGrant ? "Regenerar QR Otorgar" : undefined}
          onRotate={onRotateGrant}
          rotating={rotating === "grant"}
          loading={loading}
          onError={onError}
        />
        <PromotionQrBlock
          title="QR para usar"
          description="El cliente escanea este QR para marcar la promoción como utilizada."
          value={promotionUseQrValue(useToken)}
          promotionName={promotionName}
          printLabel={printable ? "Imprimir QR usar" : undefined}
          rotateLabel={onRotateUse ? "Regenerar QR Usar" : undefined}
          onRotate={onRotateUse}
          rotating={rotating === "use"}
          loading={loading}
          onError={onError}
        />
      </div>
    </div>
  );
}
