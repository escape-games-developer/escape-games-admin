-- Juego social deja de tener un precio por jugador y pasa a una tabla de
-- precios TOTALES por tamaño de grupo. No es una escalera calculada: cada
-- fila es un precio cerrado que se edita a mano desde el panel.
-- El descuento de la promoción se aplica sobre estos totales.
update public.intranet_config
set cotizador = jsonb_set(
      cotizador,
      '{juego_social}',
      jsonb_build_object(
        'precios', jsonb_build_array(
          jsonb_build_object('personas', 2, 'precio', 60000),
          jsonb_build_object('personas', 3, 'precio', 84000),
          jsonb_build_object('personas', 4, 'precio', 104000),
          jsonb_build_object('personas', 5, 'precio', 120000),
          jsonb_build_object('personas', 6, 'precio', 132000),
          jsonb_build_object('personas', 7, 'precio', 140000)
        ),
        'promos', coalesce(
          cotizador #> '{juego_social,promos}',
          jsonb_build_object(
            'pack_familiar', jsonb_build_object('descuento', 25, 'minimo', 4),
            'promo_amigos',  jsonb_build_object('descuento', 20, 'minimo', 3),
            'sin_descuento', jsonb_build_object('descuento', 0,  'minimo', 0)
          )
        )
      )
    ),
    updated_at = now()
where id = 'default';
