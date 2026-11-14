const SUPABASE_URL = 'https://supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3cWFxcGlvY3N4ZGdmaHRzaWh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ2NzIyNzcsImV4cCI6MjExMDI0ODI3N30.SaC_kekEhFusvRkrimsV5LqApdtdKsI2N0gZihjLQNY';
const EMAIL_ADMIN = 'agenciakazits@gmail.com';

let modoAuth = 'login';
let sessaoAtual = JSON.parse(localStorage.getItem('guia_sessao') || 'null');
let ehAdmin = false;

function headersAuth(extra) {
    return Object.assign({
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + (sessaoAtual ? sessaoAtual.access_token : SUPABASE_KEY)
    }, extra || {});
}

function mudarAbaAuth(modo) {
    modoAuth = modo;
    document.getElementById('tab-login').classList.toggle('ativa', modo === 'login');
    document.getElementById('tab-cadastro').classList.toggle('ativa', modo === 'cadastro');
    document.getElementById('campo-empresa').style.display = modo === 'cadastro' ? 'block' : 'none';
    document.getElementById('btn-auth-submit').textContent = modo === 'login' ? 'Entrar no Painel' : 'Criar Conta e Entrar';
    document.getElementById('msg-auth').textContent = '';
}

async function processarAuth(e) {
    e.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-senha').value;
    const msg = document.getElementById('msg-auth');
    const btn = document.getElementById('btn-auth-submit');

    btn.disabled = true;
    msg.style.color = '#047857';
    msg.textContent = 'Conectando...';

    try {
        const rota = modoAuth === 'cadastro' ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password';
        const res = await fetch(SUPABASE_URL + rota, {
            method: 'POST',
            headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, password: password })
        });
        const dados = await res.json();

        if (!res.ok) {
            msg.style.color = '#dc2626';
            msg.textContent = dados.error_description || dados.msg || 'Erro ao autenticar.';
            btn.disabled = false;
            return;
        }

        if (!dados.access_token) {
            msg.style.color = '#d97706';
            msg.textContent = 'Conta criada! Confirme o e-mail ou desative "Confirm email" no Supabase e clique em Entrar.';
            mudarAbaAuth('login');
            btn.disabled = false;
            return;
        }

        sessaoAtual = { access_token: dados.access_token, user: dados.user };
        localStorage.setItem('guia_sessao', JSON.stringify(sessaoAtual));
        verificarSessao();
    } catch (err) {
        msg.style.color = '#dc2626';
        msg.textContent = 'Erro de rede ao conectar.';
    }
    btn.disabled = false;
}

function verificarSessao() {
    if (!sessaoAtual || !sessaoAtual.user) {
        document.getElementById('tela-auth').style.display = 'block';
        document.getElementById('tela-sistema').style.display = 'none';
        document.getElementById('btn-sair').style.display = 'none';
        return;
    }

    document.getElementById('tela-auth').style.display = 'none';
    document.getElementById('tela-sistema').style.display = 'block';
    document.getElementById('btn-sair').style.display = 'inline-block';

    ehAdmin = sessaoAtual.user.email.toLowerCase() === EMAIL_ADMIN.toLowerCase();
    document.getElementById('usuario-logado-texto').textContent = ehAdmin
        ? 'Logado como ADMINISTRADOR (' + sessaoAtual.user.email + ')'
        : 'Logado como Anunciante (' + sessaoAtual.user.email + ')';

    if (ehAdmin) {
        document.getElementById('titulo-lista-anuncios').textContent = 'Gerenciar Todos os Anúncios (Admin)';
        document.getElementById('box-admin-newsletter').style.display = 'block';
        carregarNewsletter();
    }
    carregarAnunciosPainel();
}

async function criarAnuncio(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-salvar-anuncio');
    const arquivo = document.getElementById('anuncio-arquivo').files.item(0);
    if (!arquivo) return;

    btn.disabled = true;
    btn.textContent = 'Enviando imagem...';

    try {
        const nomeLimpo = arquivo.name.replace(/[^a-zA-Z0-9.]/g, '');
        const nomeArquivo = Date.now() + '_' + nomeLimpo;
        const upRes = await fetch(SUPABASE_URL + '/storage/v1/object/banners/' + nomeArquivo, {
            method: 'POST',
            headers: headersAuth({ 'Content-Type': arquivo.type || 'image/jpeg' }),
            body: arquivo
        });

        if (!upRes.ok) {
            alert('Erro ao subir imagem. Verifique o bucket banners no Supabase.');
            btn.disabled = false;
            btn.textContent = 'Enviar Anúncio';
            return;
        }

        const imagem_url = SUPABASE_URL + '/storage/v1/object/public/banners/' + nomeArquivo;
        const novoAnuncio = {
            usuario_id: sessaoAtual.user.id,
            titulo: document.getElementById('anuncio-titulo').value,
            categoria: document.getElementById('anuncio-categoria').value,
            whatsapp: document.getElementById('anuncio-whats').value,
            descricao: document.getElementById('anuncio-desc').value,
            imagem_url: imagem_url,
            aprovado: ehAdmin,
            destaque_topo: false
        };

        const insRes = await fetch(SUPABASE_URL + '/rest/v1/anuncios', {
            method: 'POST',
            headers: headersAuth({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(novoAnuncio)
        });

        if (insRes.ok) {
            alert(ehAdmin ? 'Anúncio publicado!' : 'Anúncio enviado para aprovação!');
            e.target.reset();
            carregarAnunciosPainel();
        } else {
            alert('Erro ao salvar anúncio.');
        }
    } catch (err) {
        alert('Erro de conexão.');
    }

    btn.disabled = false;
    btn.textContent = 'Enviar Anúncio';
}

async function carregarAnunciosPainel() {
    const filtro = ehAdmin ? '' : 'usuario_id=eq.' + sessaoAtual.user.id + '&';
    const res = await fetch(SUPABASE_URL + '/rest/v1/anuncios?' + filtro + 'order=criado_em.desc', { headers: headersAuth() });
    const lista = await res.json();
    const container = document.getElementById('lista-painel-anuncios');

    if (!Array.isArray(lista) || lista.length === 0) {
        container.innerHTML = '<p style="color:#6b7280;">Nenhum anúncio cadastrado ainda.</p>';
        return;
    }

    container.innerHTML = lista.map(function(item) {
        const botoesAdmin = ehAdmin
            ? '<button onclick="atualizarAnuncio(\'' + item.id + '\', {aprovado: ' + (!item.aprovado) + '})" class="btn-acao btn-aprovar">' + (item.aprovado ? 'Pausar' : 'Aprovar') + '</button>' +
              '<button onclick="atualizarAnuncio(\'' + item.id + '\', {destaque_topo: ' + (!item.destaque_topo) + ', aprovado: true})" class="btn-acao btn-topo">' + (item.destaque_topo ? 'Tirar Topo' : 'Por no Topo') + '</button>'
            : '';

        return '<div class="card-comercio">' +
            '<img src="' + item.imagem_url + '" alt="' + item.titulo + '">' +
            '<div class="card-body">' +
            '<span class="badge-status ' + (item.aprovado ? 'status-aprovado' : 'status-pendente') + '">' + (item.aprovado ? 'No Ar' : 'Pendente') + '</span>' +
            (item.destaque_topo ? '<span class="badge-status" style="background:#dbeafe; color:#1e40af; margin-left:4px;">Topo</span>' : '') +
            '<h3 style="margin-top:8px;">' + item.titulo + '</h3>' +
            '<p>' + item.categoria + ' • Whats: ' + item.whatsapp + '</p>' +
            '<div style="margin-top:10px;">' + botoesAdmin +
            '<button onclick="excluirAnuncio(\'' + item.id + '\')" class="btn-acao btn-excluir">Excluir</button>' +
            '</div></div></div>';
    }).join('');
}

async function atualizarAnuncio(id, campos) {
    await fetch(SUPABASE_URL + '/rest/v1/anuncios?id=eq.' + id, {
        method: 'PATCH',
        headers: headersAuth({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(campos)
    });
    carregarAnunciosPainel();
}

async function excluirAnuncio(id) {
    if (!confirm('Apagar este anúncio?')) return;
    await fetch(SUPABASE_URL + '/rest/v1/anuncios?id=eq.' + id, { method: 'DELETE', headers: headersAuth() });
    carregarAnunciosPainel();
}

async function carregarNewsletter() {
    const res = await fetch(SUPABASE_URL + '/rest/v1/newsletter?order=criado_em.desc', { headers: headersAuth() });
    const lista = await res.json();
    document.getElementById('corpo-tabela-news').innerHTML = (Array.isArray(lista) ? lista : []).map(function(row) {
        return '<tr><td>' + row.nome + '</td><td>' + row.email + '</td><td>' + new Date(row.criado_em).toLocaleDateString('pt-BR') + '</td></tr>';
    }).join('');
}

function sair() {
    localStorage.removeItem('guia_sessao');
    sessaoAtual = null;
    verificarSessao();
}

verificarSessao();
