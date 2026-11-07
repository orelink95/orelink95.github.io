document.addEventListener('DOMContentLoaded', async () => {
    const store = await Athenaeum.ready;
    const spells = store.all('spell');
    // render cards; long text: store.autolink(store.md(s.body), { exclude: s.id })
});