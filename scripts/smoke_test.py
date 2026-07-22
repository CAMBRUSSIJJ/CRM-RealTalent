#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import shutil
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
STANDALONE = (ROOT / 'REALTALENT-CRM-V100-29-standalone.html').read_text(encoding='utf-8')
OUTPUT = ROOT / 'TESTE-SMOKE-V100-29.json'
results: dict[str, object] = {'passed': False, 'checks': [], 'console_errors': [], 'page_errors': [], 'error': None}

ROUTES = ['Meu Dia', 'Leads', 'Pipeline', 'Follow-ups', 'Ligações', 'Agenda', 'Playbooks', 'Metas', 'Automações', 'Garimpo', 'Métricas', 'Configurações']

def render(page) -> None:
    page.set_content(STANDALONE, wait_until='load')

def complete_onboarding(page, suffix: str = '') -> None:
    page.get_by_role('heading', name='Como você quer começar?').wait_for()
    page.get_by_label('Seu nome').fill(f'Pessoa Teste{suffix}')
    page.get_by_label('Nome da empresa').fill(f'Empresa Teste{suffix}')
    page.get_by_label('E-mail de identificação (opcional)').fill(f'teste{suffix.lower().replace(" ", "")}@empresa.local')
    page.get_by_role('button', name='Entrar no CRM').click()
    page.get_by_role('heading', name='Meu Dia').wait_for()

def no_global_overflow(page) -> bool:
    return page.locator('body').evaluate('el => el.scrollWidth <= window.innerWidth + 1')

def assert_healthy(page, label: str) -> None:
    page.wait_for_timeout(180)
    if page.locator('.fatal-state').count():
        raise AssertionError(f'estado fatal ao abrir {label}')
    if not no_global_overflow(page):
        raise AssertionError(f'overflow global ao abrir {label}')

try:
    with sync_playwright() as p:
        configured_browser = os.environ.get('CHROMIUM_PATH')
        system_browser = next((shutil.which(name) for name in ('chromium', 'chromium-browser', 'google-chrome') if shutil.which(name)), None)
        launch_options = {'headless': True, 'args': ['--no-sandbox']}
        if configured_browser or system_browser:
            launch_options['executable_path'] = configured_browser or system_browser
        browser = p.chromium.launch(**launch_options)
        page = browser.new_page(viewport={'width': 1500, 'height': 1050})
        page.set_default_timeout(15000)
        page.on('console', lambda msg: results['console_errors'].append(msg.text) if msg.type == 'error' else None)
        page.on('pageerror', lambda error: results['page_errors'].append(str(error)))

        render(page)
        page.get_by_role('radio', name='Conhecer com exemplos').wait_for()
        page.get_by_role('radio', name='Começar com base vazia').wait_for()
        complete_onboarding(page)
        page.locator('.sidebar__brand-copy strong').get_by_text('Empresa Teste', exact=True).wait_for()
        page.locator('.sidebar__profile-copy strong').get_by_text('Pessoa Teste', exact=True).wait_for()
        results['checks'].append('primeiro acesso personaliza perfil e empresa antes de abrir o CRM')

        if page.get_by_role('button', name='Sair').count():
            raise AssertionError('modo local ainda exibe um botão de saída sem autenticação real')
        page.get_by_text('Modo local', exact=True).wait_for()
        results['checks'].append('modo local está identificado e não simula logout')

        page.get_by_role('button', name='Abrir guia rápido').click()
        page.get_by_role('heading', name='Guia rápido do CRM').wait_for()
        page.get_by_text('1. Cadastre ou importe os leads').wait_for()
        page.get_by_role('button', name='Fechar').last.click()
        results['checks'].append('guia rápido para novos usuários está acessível')

        for label in ROUTES:
            page.locator('.sidebar__item', has_text=label).click()
            assert_healthy(page, label)
        results['checks'].append('todas as 12 áreas abriram sem crash ou overflow global')

        page.locator('.sidebar__item', has_text='Pipeline').click()
        page.get_by_role('button', name='Equipe', exact=True).wait_for()
        page.get_by_text('Previsão ponderada', exact=True).wait_for()
        page.get_by_title('Iniciar cadência').first.click()
        page.get_by_role('heading', name='Iniciar cadência profissional').wait_for()
        page.get_by_role('button', name='Cancelar').click()
        page.get_by_title('Mensagem e roteiro por etapa').first.click()
        page.get_by_role('heading', name='Contato assistido').wait_for()
        page.get_by_text('Objetivo desta abordagem', exact=True).wait_for()
        page.get_by_role('button', name='Fechar').last.click()
        page.get_by_role('button', name='Previsão', exact=True).click()
        page.get_by_text('Fechamento esperado', exact=True).first.wait_for()
        results['checks'].append('Pipeline abriu visão de equipe, cadência, contato assistido e forecast por fechamento')

        page.get_by_role('button', name='Kanban', exact=True).click()
        page.locator('.pipeline-call-status').first.wait_for()
        if page.locator('.pipeline-call-status').count() < 1:
            raise AssertionError('cards do Pipeline não exibiram o status de ligação')
        results['checks'].append('cards do Pipeline exibem indicador de ligação pendente, agendada ou realizada')

        page.locator('.sidebar__item', has_text='Ligações').click()
        page.get_by_role('button', name='Começar rotina').click()
        page.get_by_role('heading', name='Modo Ligação em Foco').wait_for()
        page.get_by_text('Diga agora', exact=True).wait_for()
        page.get_by_role('heading', name='Ganhe permissão para continuar', exact=True).wait_for()
        page.locator('.modal--full').wait_for()
        if not no_global_overflow(page):
            raise AssertionError('Modo Ligação em tela cheia criou overflow global')
        page.get_by_role('button', name='Sair da tela cheia').click()
        page.get_by_role('button', name='Tela cheia').wait_for()
        page.get_by_role('button', name='Fechar').last.click()
        results['checks'].append('Modo Ligação mantém o roteiro central e alterna tela cheia sem overflow')

        page.locator('.sidebar__item', has_text='Configurações').click()
        page.get_by_role('heading', name='Configurações, segurança e diagnóstico').wait_for()
        page.get_by_role('heading', name='Integridade dos dados').wait_for()
        page.get_by_text('Base consistente').wait_for()
        results['checks'].append('diagnóstico de integridade carregou sem alertas críticos')

        page.get_by_role('button', name='Integrações', exact=True).click()
        page.get_by_role('heading', name='Central de Integrações').wait_for()
        page.get_by_role('heading', name='Extensão RealTalent → CRM').wait_for()
        page.get_by_text('Google Calendar', exact=True).wait_for()
        page.get_by_text('Planejado', exact=True).first.wait_for()
        page.get_by_role('button', name='Salvar integração').click()
        page.get_by_role('button', name='Testar configuração').click()
        page.get_by_text('Caixa local pronta para receber capturas neste navegador.', exact=True).wait_for()
        if page.locator('.toast--error').count():
            raise AssertionError(f'Central de Integrações exibiu erro: {page.locator(".toast--error").all_inner_texts()}')
        if os.environ.get('SMOKE_SCREENSHOT'):
            page.screenshot(path=os.environ['SMOKE_SCREENSHOT'], full_page=True)
        results['checks'].append('Central de Integrações diferencia conexão local, canais assistidos e recursos planejados')

        page.locator('.sidebar__item', has_text='Automações').click()
        page.get_by_role('button', name='Operação', exact=False).click()
        page.get_by_role('heading', name='Fila, avisos e contatos preparados').wait_for()
        page.get_by_role('heading', name='Fila de automação').wait_for()
        page.get_by_role('heading', name='Mensagens preparadas').wait_for()
        results['checks'].append('Central operacional abriu fila, avisos internos e mensagens assistidas')

        page.locator('.sidebar__item', has_text='Configurações').click()
        page.get_by_role('heading', name='Configurações, segurança e diagnóstico').wait_for()
        page.get_by_role('button', name='Equipe', exact=True).click()
        page.get_by_text('Simulação local:', exact=False).wait_for()
        results['checks'].append('convites locais são apresentados como simulação, sem prometer envio real')

        page.get_by_role('button', name='Empresa', exact=True).click()
        page.get_by_label('Nome exibido no CRM').fill('RealTalent Teste')
        page.locator('input[type="color"]').nth(0).fill('#1d9e75')
        page.get_by_role('button', name='Aplicar configurações').click()
        page.locator('.sidebar__brand-copy strong').get_by_text('RealTalent Teste', exact=True).wait_for()
        results['checks'].append('marca e cor foram persistidas e aplicadas')

        page.get_by_role('button', name='Navegação', exact=True).click()
        page.get_by_label('Nome da aba Leads').fill('Contatos')
        page.get_by_role('button', name='Aplicar configurações').click()
        page.locator('.sidebar__item', has_text='Contatos').wait_for()
        results['checks'].append('navegação personalizada sem perder rotas essenciais')

        page.get_by_role('button', name='Minha conta', exact=True).click()
        page.locator('.settings-choice', has_text='Escuro').click()
        page.get_by_role('button', name='Aplicar configurações').click()
        if page.locator('html').get_attribute('data-theme') != 'dark':
            raise AssertionError('tema escuro não foi aplicado')
        results['checks'].append('tema escuro aplicado')

        page.get_by_role('button', name='Dados e segurança', exact=True).click()
        page.get_by_role('heading', name='Exportação e restauração').wait_for()
        page.get_by_role('heading', name='Limpeza e restauração visual').wait_for()
        results['checks'].append('backup, auditoria e zona de risco carregaram')

        clean = browser.new_page(viewport={'width': 1366, 'height': 900})
        clean.set_default_timeout(15000)
        clean.on('console', lambda msg: results['console_errors'].append(msg.text) if msg.type == 'error' else None)
        clean.on('pageerror', lambda error: results['page_errors'].append(str(error)))
        render(clean)
        clean.get_by_role('radio', name='Começar com base vazia').check()
        complete_onboarding(clean, ' Limpo')
        clean.locator('.sidebar__item', has_text='Leads').click()
        clean.get_by_role('heading', name='Nenhum lead encontrado').wait_for()
        assert_healthy(clean, 'base vazia para novo cliente')
        results['checks'].append('novo cliente pode começar com base vazia sem dados de demonstração')

        tablet = browser.new_page(viewport={'width': 1024, 'height': 768})
        tablet.set_default_timeout(15000)
        tablet.on('console', lambda msg: results['console_errors'].append(msg.text) if msg.type == 'error' else None)
        tablet.on('pageerror', lambda error: results['page_errors'].append(str(error)))
        render(tablet)
        complete_onboarding(tablet, ' Tablet')
        for label in ('Leads', 'Pipeline', 'Ligações', 'Automações'):
            tablet.locator('.sidebar__item', has_text=label).click()
            assert_healthy(tablet, f'{label} em 1024px')
        results['checks'].append('áreas críticas abriram em 1024px sem overflow global')

        mobile = browser.new_page(viewport={'width': 390, 'height': 844})
        mobile.set_default_timeout(15000)
        mobile.on('console', lambda msg: results['console_errors'].append(msg.text) if msg.type == 'error' else None)
        mobile.on('pageerror', lambda error: results['page_errors'].append(str(error)))
        render(mobile)
        complete_onboarding(mobile, ' Mobile')
        mobile.locator('.mobile-nav button', has_text='Mais').click()
        mobile.locator('.mobile-more-menu button', has_text='Configurações').click()
        mobile.get_by_role('heading', name='Configurações, segurança e diagnóstico').wait_for()
        assert_healthy(mobile, 'Configurações no celular')
        results['checks'].append('mobile completou o primeiro acesso e abriu Configurações sem overflow')

        errors = [str(error) for error in results['console_errors'] if 'favicon' not in str(error).lower()]
        results['console_errors'] = errors
        if errors or results['page_errors']:
            raise AssertionError(f'erros de execução: console={errors}; página={results["page_errors"]}')
        results['passed'] = True
        browser.close()
except Exception as exc:
    results['error'] = str(exc)
finally:
    OUTPUT.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding='utf-8')

if not results['passed']:
    raise SystemExit(results['error'] or 'smoke test falhou')
print(json.dumps(results, indent=2, ensure_ascii=False))
