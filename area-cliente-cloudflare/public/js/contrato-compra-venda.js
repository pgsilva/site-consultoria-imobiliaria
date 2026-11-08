(function () {
    'use strict';

    var form = document.getElementById('contractDataForm');
    var template = document.getElementById('partyTemplate');
    var generateButton = document.getElementById('generateDataPdf');
    var status = document.getElementById('contractStatus');
    if (!form || !template) return;

    function digits(value) { return String(value || '').replace(/\D/g, ''); }
    function cpfMask(value) {
        return digits(value).slice(0, 11)
            .replace(/^(\d{3})(\d)/, '$1.$2')
            .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
            .replace(/\.(\d{3})(\d)/, '.$1-$2');
    }
    function moneyMask(value) {
        var number = Number(digits(value)) / 100;
        return number ? number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
    }
    function cards(type) { return Array.prototype.slice.call(document.querySelectorAll('[data-type="' + type + '"]')); }
    function updateCards(type) {
        var label = type === 'seller' ? 'Vendedor' : 'Comprador';
        var list = cards(type);
        list.forEach(function (card, index) {
            card.querySelector('legend').textContent = label + ' ' + (index + 1);
            card.querySelector('[data-remove]').disabled = list.length === 1;
        });
    }
    function addParty(type) {
        var card = template.content.firstElementChild.cloneNode(true);
        card.dataset.type = type;
        card.querySelector('[data-field="cpf"]').addEventListener('input', function (event) {
            event.target.value = cpfMask(event.target.value);
        });
        card.querySelector('[data-remove]').addEventListener('click', function () {
            if (cards(type).length > 1) { card.remove(); updateCards(type); }
        });
        document.getElementById(type + 'List').appendChild(card);
        updateCards(type);
    }
    function readParty(card) {
        var result = {};
        card.querySelectorAll('[data-field]').forEach(function (input) { result[input.dataset.field] = input.value.trim(); });
        return result;
    }
    function readData() {
        var values = Object.fromEntries(new FormData(form).entries());
        return {
            sellers: cards('seller').map(readParty),
            buyers: cards('buyer').map(readParty),
            property: {
                registration: values.matricula, registry: values.cartorio, address: values.endereco_imovel,
                district: values.bairro, city: values.cidade, state: values.uf, postalCode: values.cep
            },
            payment: {
                total: values.valor_total, deposit: values.sinal || 'R$ 0,00', fgts: values.fgts || 'R$ 0,00',
                downPayment: values.entrada || 'R$ 0,00', financing: values.financiamento || 'R$ 0,00',
                bank: values.banco, branch: values.agencia, account: values.conta
            },
            signature: {
                city: values.cidade_assinatura, date: values.data_assinatura,
                financingDays: values.prazo_financiamento, terminationDays: values.prazo_rescisao
            },
            createdAt: new Date()
        };
    }
    function showPdfInBrowser(resultWindow, pdfBytes) {
        var pdfUrl = URL.createObjectURL(new Blob([pdfBytes], { type: 'application/pdf' }));
        resultWindow.location.replace(pdfUrl);
        window.setTimeout(function () { URL.revokeObjectURL(pdfUrl); }, 300000);
    }

    document.querySelectorAll('[data-add]').forEach(function (button) {
        button.addEventListener('click', function () { addParty(button.dataset.add); });
    });
    document.querySelectorAll('.money').forEach(function (input) {
        input.addEventListener('input', function () { input.value = moneyMask(input.value); });
    });
    document.getElementById('printData').addEventListener('click', function () {
        if (form.reportValidity()) window.print();
    });
    generateButton.addEventListener('click', async function () {
        status.classList.remove('is-error');
        if (!form.reportValidity()) { status.textContent = 'Revise os campos obrigatórios antes de gerar o PDF.'; status.classList.add('is-error'); return; }
        if (!window.PremiumPurchaseContractPdf) { status.textContent = 'O gerador do contrato não foi carregado.'; status.classList.add('is-error'); return; }
        var resultWindow = window.open('', '_blank');
        if (!resultWindow) { status.textContent = 'Permita a abertura de uma nova aba para visualizar o PDF.'; status.classList.add('is-error'); return; }
        resultWindow.document.title = 'Preparando contrato...';
        resultWindow.document.body.innerHTML = '<p style="font:16px Arial;padding:24px">Preparando o contrato em PDF...</p>';
        generateButton.disabled = true;
        status.textContent = 'Gerando o contrato...';
        try {
            var pdfBytes = await window.PremiumPurchaseContractPdf.createPdfBytes(readData());
            showPdfInBrowser(resultWindow, pdfBytes);
            status.textContent = 'Contrato aberto em uma nova aba.';
        } catch (error) {
            resultWindow.close();
            status.textContent = error && error.message ? error.message : 'Não foi possível gerar o PDF.';
            status.classList.add('is-error');
        } finally {
            generateButton.disabled = false;
        }
    });
    form.addEventListener('reset', function () {
        window.setTimeout(function () {
            ['seller', 'buyer'].forEach(function (type) {
                cards(type).slice(1).forEach(function (card) { card.remove(); });
                updateCards(type);
            });
            status.textContent = '';
        }, 0);
    });

    var now = new Date();
    form.querySelector('[name="data_assinatura"]').value = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    addParty('seller');
    addParty('buyer');
}());
