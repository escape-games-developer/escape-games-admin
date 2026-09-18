-- Los acompañantes pasan a calcularse sobre el precio de invitado de la
-- propia cotización (con su descuento por cantidad ya aplicado), no sobre una
-- tarifa adulto aparte. Eso deja dos claves sin uso:
--
--   piso_precio_por_persona -> el guardarraíl del editor bloquea cualquier
--     decremento que rompa la escalera, y eso ocurre mucho antes de que el
--     precio llegue a $0. El piso quedaba como código muerto.
--   edad_requiere_adulto -> el requisito lo determina el rango elegido
--     (10 a 12 = requisito), no un umbral numérico configurable.
update public.intranet_config
set cotizador = jsonb_set(
      cotizador,
      '{escaparty}',
      (cotizador -> 'escaparty') #- '{piso_precio_por_persona}' #- '{edad_requiere_adulto}'
    ),
    updated_at = now()
where id = 'default';
