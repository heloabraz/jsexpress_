const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const cfg = {
  clientes: {
    titulo: 'Clientes',
    singular: 'cliente',
    descricao: 'Organize os dados das pessoas cadastradas.',
    campos: [['nome', 'Nome completo', 'text'], ['email', 'E-mail', 'email'], ['telefone', 'Telefone', 'tel']]
  },
  fornecedores: {
    titulo: 'Fornecedores',
    singular: 'fornecedor',
    descricao: 'Mantenha os contatos dos seus fornecedores em um só lugar.',
    campos: [['nome', 'Nome / Empresa', 'text'], ['email', 'E-mail', 'email'], ['telefone', 'Telefone', 'tel']]
  },
  produtos: {
    titulo: 'Produtos',
    singular: 'produto',
    descricao: 'Controle os produtos, preços e quantidades em estoque.',
    campos: [['nome', 'Nome do produto', 'text'], ['preco', 'Preço (R$)', 'number'], ['estoque', 'Estoque', 'number']]
  }
};

function arquivo(entidade) {
  return path.join(DATA_DIR, `${entidade}.json`);
}

function ler(entidade) {
  const caminho = arquivo(entidade);
  if (!fs.existsSync(caminho)) fs.writeFileSync(caminho, '[]', 'utf8');

  try {
    const dados = JSON.parse(fs.readFileSync(caminho, 'utf8'));
    return Array.isArray(dados) ? dados : [];
  } catch (erro) {
    console.error(`Não foi possível ler ${caminho}:`, erro);
    return [];
  }
}

function salvar(entidade, dados) {
  fs.writeFileSync(arquivo(entidade), JSON.stringify(dados, null, 2), 'utf8');
}

function entidadeValida(req, res, next) {
  const entidade = req.params.entidade;
  if (!Object.prototype.hasOwnProperty.call(cfg, entidade)) {
    return res.status(404).send('Página não encontrada.');
  }
  req.entidade = entidade;
  req.config = cfg[entidade];
  next();
}

function validarCampos(entidade, body) {
  const erros = [];
  for (const [chave, rotulo, tipo] of cfg[entidade].campos) {
    const valor = String(body[chave] ?? '').trim();
    if (!valor) erros.push(`Preencha o campo ${rotulo.toLowerCase()}.`);
    if (tipo === 'email' && valor && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)) {
      erros.push('Informe um e-mail válido.');
    }
    if (tipo === 'number' && valor && (!Number.isFinite(Number(valor)) || Number(valor) < 0)) {
      erros.push(`${rotulo} deve ser um número igual ou maior que zero.`);
    }
  }
  return erros;
}

app.get('/health', (req, res) => res.status(200).send('OK'));

app.get('/', (req, res) => {
  const totais = Object.fromEntries(Object.keys(cfg).map(chave => [chave, ler(chave).length]));
  res.render('index', { nomes: ['Eloá Braz', 'Isabella Barbosa'], totais });
});

app.get('/:entidade', entidadeValida, (req, res) => {
  res.render('lista', {
    e: req.entidade,
    c: req.config,
    dados: ler(req.entidade),
    msg: req.query.msg || '',
    tipoMsg: req.query.tipo || 'success'
  });
});

app.get('/:entidade/novo', entidadeValida, (req, res) => {
  res.render('form', {
    e: req.entidade, c: req.config, item: {},
    acao: `/${req.entidade}`, erros: []
  });
});

app.post('/:entidade', entidadeValida, (req, res) => {
  const erros = validarCampos(req.entidade, req.body);
  if (erros.length) {
    return res.status(400).render('form', {
      e: req.entidade, c: req.config, item: req.body,
      acao: `/${req.entidade}`, erros
    });
  }

  const dados = ler(req.entidade);
  const proximoId = dados.length ? Math.max(...dados.map(item => Number(item.id) || 0)) + 1 : 1;
  const novoItem = { id: proximoId };

  req.config.campos.forEach(([chave]) => {
    novoItem[chave] = String(req.body[chave] ?? '').trim();
  });

  dados.push(novoItem);
  salvar(req.entidade, dados);
  res.redirect(`/${req.entidade}?msg=${encodeURIComponent('Cadastro realizado com sucesso!')}`);
});

app.get('/:entidade/editar/:id', entidadeValida, (req, res) => {
  const item = ler(req.entidade).find(registro => String(registro.id) === req.params.id);
  if (!item) return res.status(404).send('Registro não encontrado.');
  res.render('form', {
    e: req.entidade, c: req.config, item,
    acao: `/${req.entidade}/editar/${req.params.id}`, erros: []
  });
});

app.post('/:entidade/editar/:id', entidadeValida, (req, res) => {
  const dados = ler(req.entidade);
  const indice = dados.findIndex(registro => String(registro.id) === req.params.id);
  if (indice === -1) return res.status(404).send('Registro não encontrado.');

  const erros = validarCampos(req.entidade, req.body);
  if (erros.length) {
    return res.status(400).render('form', {
      e: req.entidade, c: req.config, item: { ...req.body, id: req.params.id },
      acao: `/${req.entidade}/editar/${req.params.id}`, erros
    });
  }

  const atualizado = { id: dados[indice].id };
  req.config.campos.forEach(([chave]) => {
    atualizado[chave] = String(req.body[chave] ?? '').trim();
  });
  dados[indice] = atualizado;
  salvar(req.entidade, dados);
  res.redirect(`/${req.entidade}?msg=${encodeURIComponent('Alterações salvas com sucesso!')}`);
});

app.post('/:entidade/excluir/:id', entidadeValida, (req, res) => {
  const dados = ler(req.entidade);
  const filtrados = dados.filter(registro => String(registro.id) !== req.params.id);
  if (filtrados.length === dados.length) return res.status(404).send('Registro não encontrado.');
  salvar(req.entidade, filtrados);
  res.redirect(`/${req.entidade}?msg=${encodeURIComponent('Registro excluído com sucesso!')}`);
});

app.use((req, res) => res.status(404).send('Página não encontrada.'));

app.use((erro, req, res, next) => {
  console.error('Erro interno:', erro);
  if (res.headersSent) return next(erro);
  res.status(500).send('Ocorreu um erro interno. Verifique o terminal para mais detalhes.');
});

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sistema disponível em http://localhost:${PORT}`);
  });
}

module.exports = app;
