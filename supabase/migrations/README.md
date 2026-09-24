# Migraciones — cómo se ejecutan y qué hay que respetar

Las migraciones se aplican **a mano**, en orden numérico, una sola vez cada una,
desde el *SQL Editor* de Supabase. No hay `supabase/config.toml` ni CLI en el
proyecto, y CI no las aplica ni las valida: son la única parte del sistema sin
red de seguridad automática. De ahí este documento.

El orden de despliegue de cada archivo y qué hace está en el
[README principal](../../README.md#migración-de-supabase-v21).

## Antes de ejecutar una migración destructiva

«Destructiva» es cualquier `drop column`, `drop table` o `delete` sin `where`
acotado a filas que sabes que sobran.

1. **Respaldar la tabla completa**, con la fecha en el nombre:

   ```sql
   create table public.<tabla>_backup_<YYYYMMDD> as
     select * from public.<tabla>;
   ```

2. **Ejecutar la consulta de verificación** que el propio archivo incluye en su
   cabecera, y comprobar que devuelve lo que el comentario dice que debe
   devolver. Las de la `0003` y la `0006` están escritas ahí.

3. Solo entonces, ejecutar la migración.

4. Borrar el respaldo **semanas después**, no el mismo día, y solo tras
   confirmar que nadie reporta datos perdidos.

> **Esto no se cumplió del todo.** La `0003` dice «`profiles_backup_20260813`
> queda como respaldo», pero ninguna migración del repositorio la crea: se hizo
> a mano y el repo no lo registra. La `0006` sí trae el `create table ... as`
> escrito. La regla es la de la `0006`; el hueco de la `0003` es el motivo de
> que este archivo exista.

## Lo irreversible que ya se ejecutó

`0001_entities_and_rls.sql:24` hace:

```sql
delete from public.profiles where id is null;
```

Es decir: **borra todo perfil cuyo email no case con ninguna fila de
`auth.users`**. Se aplicó en producción y no se puede deshacer desde el código.
Se documenta aquí para que quede constancia, no porque quede algo que arreglar.

Si alguna vez hay que repetir el emparejamiento en otro entorno, conviene
inspeccionar antes qué se va a perder:

```sql
select email, created_at from public.profiles where id is null;
```

## `keep_newest`: por qué no avisa, y cuándo eso importa

El trigger de la `0004` descarta las escrituras cuyo `updated_at` sea anterior
al de la fila que ya está en la base. Devuelve `old`, así que **el cliente
recibe éxito aunque su escritura no se haya aplicado**.

Esto es correcto por diseño y no hace falta señal ninguna: el ciclo de
sincronización es *pull → merge → push*, de modo que lo que se sube ya viene
del merge con lo que había en el servidor. Una escritura solo puede rechazarse
si otro dispositivo escribió en la ventana entre ese pull y ese push, y el
siguiente ciclo lo reconcilia solo.

**La excepción es el reloj del dispositivo.** `updated_at` lo pone el cliente
(`nowIso()`), no el servidor. Si un dispositivo va atrasado, sus ediciones
legítimas nacen con una marca anterior a la del servidor, el trigger las
descarta una y otra vez, y el siguiente pull le pisa su propio cambio. Es
silencioso para el usuario.

Arreglarlo de raíz implica sellar `updated_at` en el servidor, lo que cambia el
contrato del merge —el cliente compara esas marcas como texto— y obliga a
revisar `src/lib/merge.ts` y la marca de agua del push. No es un parche; es un
rediseño, y no está hecho.

## RLS

Las cinco tablas de datos y `profiles` llevan RLS con `USING` y `WITH CHECK`
sobre `auth.uid()`. La `0004` añade además:

```sql
alter default privileges in schema public revoke all on tables from anon, authenticated;
```

que protege a las tablas **futuras**: si alguien crea una y se olvida de
habilitarle RLS, PostgREST no la expondrá a la anon key, que es pública por
diseño y viaja en el bundle del navegador.

Al crear una tabla nueva, habilítale RLS explícitamente igual que hacen las
existentes; no confíes solo en ese `revoke`.

Las cinco tablas que ya existían antes de la 0004 conservaron los privilegios
por defecto de Supabase (`anon` con ALL, TRUNCATE incluido). La `0016` los
retira para que todas las tablas queden con el mismo contrato: nada para
`anon`, solo `select/insert/update/delete` para `authenticated`.

### Migraciones aplicadas fuera del historial

La `0014` y la `0015` se ejecutaron desde el *SQL Editor* y no figuran en
`supabase_migrations.schema_migrations` (el historial que muestra el panel
llega a la `0013`, registrada como `goals_saved_direct`). Están aplicadas —la
tabla `recurrences` existe y las columnas de `budget_lines` son nullable—; solo
falta el registro. No hace falta repetirlas.
