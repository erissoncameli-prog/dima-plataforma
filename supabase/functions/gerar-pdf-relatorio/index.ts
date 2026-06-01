const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { html, filename } = await req.json()

    if (!html) {
      return new Response(JSON.stringify({ error: 'HTML não fornecido' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const token = Deno.env.get('BROWSERLESS_TOKEN')
    if (!token) {
      return new Response(JSON.stringify({ error: 'BROWSERLESS_TOKEN não configurado' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const browserlessRes = await fetch(
      `https://chrome.browserless.io/pdf?token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html,
          options: {
            format: 'A4',
            printBackground: true,
            preferCSSPageSize: false,
            margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' },
            displayHeaderFooter: false,
          },
          // Aguarda a página carregar completamente antes de gerar o PDF
          waitFor: 1500,
        }),
        signal: AbortSignal.timeout(60000),
      }
    )

    if (!browserlessRes.ok) {
      const errText = await browserlessRes.text().catch(() => '')
      return new Response(
        JSON.stringify({ error: `Browserless retornou HTTP ${browserlessRes.status}`, detail: errText.slice(0, 300) }),
        { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const pdfBuffer = await browserlessRes.arrayBuffer()
    const safeFilename = (filename || 'relatorio-car').replace(/[^a-z0-9_-]/gi, '_') + '.pdf'

    return new Response(pdfBuffer, {
      headers: {
        ...CORS,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeFilename}"`,
        'Content-Length': String(pdfBuffer.byteLength),
      },
    })

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
