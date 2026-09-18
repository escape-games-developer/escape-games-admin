-- El adulto acompañante deja de tener precio propio: ahora es un % de
-- descuento sobre el precio del invitado (50 por defecto).
-- Se edita con jsonb_set / #- para no pisar los precios ya cargados.
update public.intranet_config
set cotizador = jsonb_set(
      cotizador #- '{escaparty,precioAdultoAcompanante}',
      '{escaparty,descuentoAdultoAcompanante}',
      to_jsonb(50)
    ),
    updated_at = now()
where id = 'default'
  and not (cotizador -> 'escaparty' ? 'descuentoAdultoAcompanante');
