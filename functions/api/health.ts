export const onRequestGet: PagesFunction = async () => {
  return Response.json({ ok: true, name: 'resontune' });
};
