/* =====================================================================
   MARKDOWN  —  Athenaeum.md(text, options) -> HTML string
   ---------------------------------------------------------------------
   The small subset the lore needs:
     blank line        new paragraph
     # / ## / ###      headings
     > quote           blockquote; a line "> — Name" becomes its attribution
     - item / 1. item  lists
     ---               horizontal rule
     **bold**  *italic*  _italic_  `code`  [text](url)
     {text}            shown without the braces and never turned into an
                       automatic link (store.autolink): {Caeraotrom}
     line ending with two spaces or a backslash  ->  line break
   Raw HTML is passed through untouched (the content is written by the
   DM, not by visitors).
   options.dropCap   wrap the first letter of the first paragraph in
                     <span class="drop-cap"> for the page to style.
   ===================================================================== */
(function (root) {
    const ATH = root.Athenaeum = root.Athenaeum || {};

    function inline(s) {
        const codes = [];
        s = s.replace(/`([^`]+)`/g, (_, c) => {
            codes.push(c.replace(/&/g, '&amp;').replace(/</g, '&lt;'));
            return `\u0000${codes.length - 1}\u0000`;
        });
        s = s
            .replace(/\{([^{}\n]+)\}/g, '<span class="nolink">$1</span>')
            .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>')
            .replace(/(^|[^_\w])_([^_\s][^_]*?)_(?!\w)/g, '$1<em>$2</em>')
            .replace(/( {2,}|\\)\n/g, '<br>\n');
        return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
    }

    function md(text, options = {}) {
        if (!text) return '';
        const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
        const out = [];
        let i = 0;

        const isBlank = l => /^\s*$/.test(l);
        const isList = l => /^\s*([-*]|\d+\.)\s+/.test(l);
        const startsBlock = l => /^(#{1,3}\s|>|---\s*$)/.test(l) || isList(l);

        while (i < lines.length) {
            const line = lines[i];
            if (isBlank(line)) { i++; continue; }

            let m;
            if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
                const level = m[1].length + 1; // # -> h2: the page owns h1
                out.push(`<h${level}>${inline(m[2])}</h${level}>`);
                i++; continue;
            }
            if (/^---\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

            if (line.startsWith('>')) {
                const body = [], cite = [];
                while (i < lines.length && lines[i].startsWith('>')) {
                    const l = lines[i].replace(/^>\s?/, '');
                    if (/^[—–-]\s/.test(l)) cite.push(l.replace(/^[—–-]\s/, ''));
                    else body.push(l);
                    i++;
                }
                out.push(`<blockquote><p>${inline(body.join('\n').trim())}</p>` +
                    (cite.length ? `<cite>${inline(cite.join(' '))}</cite>` : '') + '</blockquote>');
                continue;
            }

            if (isList(line)) {
                const ordered = /^\s*\d+\./.test(line);
                const items = [];
                while (i < lines.length && isList(lines[i])) {
                    items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ''));
                    i++;
                }
                const tag = ordered ? 'ol' : 'ul';
                out.push(`<${tag}>${items.map(it => `<li>${inline(it)}</li>`).join('')}</${tag}>`);
                continue;
            }

            const para = [];
            while (i < lines.length && !isBlank(lines[i]) && !(para.length && startsBlock(lines[i]))) {
                para.push(lines[i]); i++;
            }
            out.push(`<p>${inline(para.join('\n'))}</p>`);
        }

        let html = out.join('\n');
        if (options.dropCap) {
            html = html.replace(/<p>((?:<[^>]+>)*)([A-Za-zÀ-ÿ])/, '<p class="has-drop-cap">$1<span class="drop-cap">$2</span>');
        }
        return html;
    }

    /* Plain text (for cards, previews, search): Markdown markers removed. */
    function plain(text) {
        if (!text) return '';
        return String(text)
            .replace(/<[^>]+>/g, '')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/[*_`>#]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    ATH.md = md;
    ATH.mdPlain = plain;
})(typeof window !== 'undefined' ? window : globalThis);
