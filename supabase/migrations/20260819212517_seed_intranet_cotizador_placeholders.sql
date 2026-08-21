-- Placeholders. precios_confirmados queda en false a propósito: hasta que
-- alguien cargue la tabla oficial y lo prenda, el cotizador muestra la banda
-- roja "Precios de ejemplo".
-- `escalones` va vacío hoy; es el lugar donde entran los cortes por cantidad
-- (24->25, 29->30) sin migración, porque la columna es jsonb.
update public.intranet_config
set cotizador = jsonb_build_object(
      'escaparty', jsonb_build_object(
        'infantil', jsonb_build_object('precioPorPersona', 25000, 'escalones', '[]'::jsonb),
        'adulto',   jsonb_build_object('precioPorPersona', 30000, 'escalones', '[]'::jsonb),
        'precioAdultoAcompanante', 0
      ),
      'juegoSocial', jsonb_build_object(
        'base', jsonb_build_object('precioPorPersona', 28000, 'escalones', '[]'::jsonb),
        'promos', jsonb_build_object(
          'pack_familiar', jsonb_build_object('descuento', 25, 'minimo', 4),
          'promo_amigos',  jsonb_build_object('descuento', 20, 'minimo', 3),
          'sin_descuento', jsonb_build_object('descuento', 0,  'minimo', 0)
        )
      )
    ),
    updated_at = now()
where id = 'default' and cotizador = '{}'::jsonb;
