(function (global) {
    'use strict';

    function value(input, fallback) { return String(input == null || input === '' ? (fallback || 'não informado') : input).trim(); }
    function sentence(input) { var result = value(input); return /[.!?]$/.test(result) ? result : result + '.'; }
    function parseCurrency(input) {
        var normalized = String(input == null ? '' : input)
            .replace(/R\$/gi, '')
            .replace(/\s/g, '')
            .replace(/\./g, '')
            .replace(',', '.')
            .replace(/[^0-9.-]/g, '');
        var amount = Number(normalized);
        return Number.isFinite(amount) ? amount : null;
    }
    function hundredsInWords(number) {
        var units = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
        var teens = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
        var tens = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
        var hundreds = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
        if (number === 100) return 'cem';
        var parts = [];
        var hundred = Math.floor(number / 100);
        var remainder = number % 100;
        if (hundred) parts.push(hundreds[hundred]);
        if (remainder >= 10 && remainder < 20) parts.push(teens[remainder - 10]);
        else {
            var ten = Math.floor(remainder / 10);
            var unit = remainder % 10;
            if (ten) parts.push(tens[ten]);
            if (unit) parts.push(units[unit]);
        }
        return parts.join(' e ');
    }
    function integerInWords(number) {
        if (number === 0) return 'zero';
        var scales = [
            { value: 1000000000, singular: 'bilhão', plural: 'bilhões' },
            { value: 1000000, singular: 'milhão', plural: 'milhões' },
            { value: 1000, singular: 'mil', plural: 'mil' }
        ];
        var remaining = number;
        var groups = [];
        scales.forEach(function (scale) {
            var quantity = Math.floor(remaining / scale.value);
            if (!quantity) return;
            var text = scale.value === 1000 && quantity === 1
                ? 'mil'
                : hundredsInWords(quantity) + ' ' + (quantity === 1 ? scale.singular : scale.plural);
            groups.push({ quantity: quantity, text: text });
            remaining %= scale.value;
        });
        if (remaining) groups.push({ quantity: remaining, text: hundredsInWords(remaining) });
        return groups.reduce(function (result, group, index) {
            if (index === 0) return group.text;
            var isLast = index === groups.length - 1;
            var conjunction = isLast && (group.quantity < 100 || group.quantity % 100 === 0) ? ' e ' : ', ';
            return result + conjunction + group.text;
        }, '');
    }
    function currencyInWords(input) {
        var amount = parseCurrency(input);
        if (amount == null || amount < 0) return '';
        var totalCents = Math.round(amount * 100);
        var reais = Math.floor(totalCents / 100);
        var cents = totalCents % 100;
        var parts = [];
        if (reais || !cents) parts.push(integerInWords(reais) + (reais === 1 ? ' real' : ' reais'));
        if (cents) parts.push(integerInWords(cents) + (cents === 1 ? ' centavo' : ' centavos'));
        return parts.join(' e ');
    }
    function amountWithWords(input, fallback) {
        var formatted = value(input, fallback || 'R$ 0,00');
        var written = currencyInWords(formatted);
        return written ? formatted + ' (' + written + ')' : formatted;
    }
    function hasPositiveAmount(input) {
        var amount = parseCurrency(input);
        return amount != null && amount > 0;
    }
    function longDate(dateValue) {
        if (!dateValue) return 'data não informada';
        var parts = String(dateValue).split('-');
        if (parts.length !== 3) return dateValue;
        var months = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
        return Number(parts[2]) + ' de ' + months[Number(parts[1]) - 1] + ' de ' + parts[0];
    }
    function qualification(person) {
        var details = [value(person.nacionalidade, 'nacionalidade não informada')];
        if (person.estado_civil) details.push(person.estado_civil);
        if (person.profissao) details.push(person.profissao);
        var documentText = 'portador(a) do CPF nº ' + value(person.cpf);
        if (person.rg) documentText += ' e do RG nº ' + person.rg;
        details.push(documentText);
        if (person.endereco) details.push('residente e domiciliado(a) em ' + person.endereco);
        return {
            name: value(person.nome).toUpperCase() + ',',
            details: details.join(', ') + '.'
        };
    }
    function wrapText(input, font, size, maxWidth) {
        var words = String(input).replace(/\s+/g, ' ').trim().split(' ');
        var lines = [];
        var current = '';
        words.forEach(function (word) {
            var candidate = current ? current + ' ' + word : word;
            if (font.widthOfTextAtSize(candidate, size) <= maxWidth) current = candidate;
            else {
                if (current) lines.push(current);
                current = word;
            }
        });
        if (current) lines.push(current);
        return lines.length ? lines : [''];
    }

    function blueWatermark(source) {
        if (!source || !global.document || !global.Image) return Promise.resolve(source);
        return new Promise(function (resolve) {
            var image = new global.Image();
            image.onload = function () {
                var canvas = global.document.createElement('canvas');
                canvas.width = image.naturalWidth;
                canvas.height = image.naturalHeight;
                var context = canvas.getContext('2d');
                context.drawImage(image, 0, 0);
                context.globalCompositeOperation = 'source-in';
                context.fillStyle = '#08264a';
                context.fillRect(0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/png'));
            };
            image.onerror = function () { resolve(source); };
            image.src = source;
        });
    }

    async function createPdfBytes(data) {
        if (!global.PDFLib) throw new Error('Biblioteca de PDF indisponível.');
        var PDFDocument = global.PDFLib.PDFDocument;
        var rgb = global.PDFLib.rgb;
        var document = await PDFDocument.create();
        if (!global.fontkit) throw new Error('Biblioteca de fontes indisponível. Atualize a página e tente novamente.');
        document.registerFontkit(global.fontkit);
        var fontResponses = await Promise.all([
            fetch('/administracao/assets/fonts/Montserrat-Regular.ttf'),
            fetch('/administracao/assets/fonts/Montserrat-Bold.ttf')
        ]);
        if (!fontResponses[0].ok || !fontResponses[1].ok) throw new Error('Não foi possível carregar a fonte Montserrat.');
        var fontBytes = await Promise.all(fontResponses.map(function (response) { return response.arrayBuffer(); }));
        var regular = await document.embedFont(fontBytes[0], { subset: true });
        var bold = await document.embedFont(fontBytes[1], { subset: true });
        var logoSource = global.PremiumSimulationAssets && global.PremiumSimulationAssets.logo;
        var logoImage = logoSource ? await document.embedPng(await blueWatermark(logoSource)) : null;
        var navy = rgb(0.01, 0.10, 0.21);
        var gold = rgb(0.91, 0.70, 0.24);
        var ink = rgb(0.08, 0.09, 0.11);
        var muted = rgb(0.36, 0.40, 0.47);
        var pages = [];
        var page;
        var y;
        var margin = 55;
        var width = 485;
        var fontSize = 10.5;
        var lineHeight = 13.2;

        document.setTitle('Contrato Particular de Compromisso de Compra e Venda de Imóvel');
        document.setAuthor('Premium Assessoria Imobiliária');
        document.setSubject('Contrato de compra e venda preenchido com os dados informados');

        function drawWatermark(currentPage) {
            if (logoImage) {
                currentPage.drawImage(logoImage, { x: 47, y: 216, width: 500, height: 410, opacity: 0.045 });
            }
        }
        function addPage(first) {
            page = document.addPage([595, 842]);
            pages.push(page);
            drawWatermark(page);
            if (first) page.drawRectangle({ x: 0, y: 799.5, width: 595, height: 42.5, color: navy });
            y = first ? 770 : 784;
        }
        function ensure(space) { if (y - space < 54) addPage(false); }
        function centered(input, font, size, yPosition, color) {
            var text = String(input);
            page.drawText(text, { x: 297.5 - font.widthOfTextAtSize(text, size) / 2, y: yPosition, size: size, font: font, color: color });
        }
        function drawJustifiedLine(line, font, size, x, yPosition, maxWidth, color) {
            var words = String(line).split(' ');
            if (words.length < 2) {
                page.drawText(line, { x: x, y: yPosition, size: size, font: font, color: color });
                return;
            }
            var wordsWidth = words.reduce(function (total, word) { return total + font.widthOfTextAtSize(word, size); }, 0);
            var gap = (maxWidth - wordsWidth) / (words.length - 1);
            var cursor = x;
            words.forEach(function (word, index) {
                page.drawText(word, { x: cursor, y: yPosition, size: size, font: font, color: color });
                cursor += font.widthOfTextAtSize(word, size) + (index < words.length - 1 ? gap : 0);
            });
        }
        function paragraph(input, options) {
            var settings = options || {};
            var size = settings.size || fontSize;
            var font = settings.bold ? bold : regular;
            var left = margin + (settings.indent || 0);
            var maxWidth = width - (settings.indent || 0);
            var lines = wrapText(input, font, size, maxWidth);
            var needed = lines.length * (settings.lineHeight || lineHeight) + (settings.after == null ? 8 : settings.after);
            ensure(needed);
            lines.forEach(function (line, index) {
                var lineY = y - index * (settings.lineHeight || lineHeight);
                if (settings.justify !== false && index < lines.length - 1) drawJustifiedLine(line, font, size, left, lineY, maxWidth, settings.color || ink);
                else page.drawText(line, { x: left, y: lineY, size: size, font: font, color: settings.color || ink });
            });
            y -= needed;
        }
        function richParagraph(segments, options) {
            var settings = options || {};
            var size = settings.size || fontSize;
            var left = margin;
            var maxWidth = width;
            var spaceWidth = regular.widthOfTextAtSize(' ', size);
            var tokens = [];
            segments.forEach(function (segment) {
                String(segment.text || '').replace(/\s+/g, ' ').trim().split(' ').forEach(function (word) {
                    if (word) tokens.push({ word: word, font: segment.font || regular });
                });
            });
            var lines = [];
            var currentLine = [];
            var currentWidth = 0;
            tokens.forEach(function (token) {
                var wordWidth = token.font.widthOfTextAtSize(token.word, size);
                var candidateWidth = currentWidth + (currentLine.length ? spaceWidth : 0) + wordWidth;
                if (currentLine.length && candidateWidth > maxWidth) {
                    lines.push(currentLine);
                    currentLine = [token];
                    currentWidth = wordWidth;
                } else {
                    currentLine.push(token);
                    currentWidth = candidateWidth;
                }
            });
            if (currentLine.length) lines.push(currentLine);
            var height = settings.lineHeight || lineHeight;
            var needed = lines.length * height + (settings.after == null ? 8 : settings.after);
            ensure(needed);
            lines.forEach(function (line, lineIndex) {
                var wordsWidth = line.reduce(function (total, token) {
                    return total + token.font.widthOfTextAtSize(token.word, size);
                }, 0);
                var gap = lineIndex < lines.length - 1 && line.length > 1
                    ? (maxWidth - wordsWidth) / (line.length - 1)
                    : spaceWidth;
                var cursor = left;
                line.forEach(function (token, tokenIndex) {
                    page.drawText(token.word, { x: cursor, y: y - lineIndex * height, size: size, font: token.font, color: settings.color || ink });
                    cursor += token.font.widthOfTextAtSize(token.word, size) + (tokenIndex < line.length - 1 ? gap : 0);
                });
            });
            y -= needed;
        }
        function clauseTitle(title) {
            ensure(30);
            y -= 3;
            paragraph(title, { bold: true, size: 10.6, after: 7, color: navy });
        }
        function label(title) {
            ensure(28);
            centered(title, bold, 10.6, y, navy);
            y -= 24;
        }
        function bullet(input) { paragraph('• ' + input, { after: 5 }); }
        function signatures(title, parties) {
            paragraph(title, { bold: true, size: 9.5, after: 16, color: navy });
            parties.forEach(function (party) {
                ensure(60);
                page.drawLine({ start: { x: 125, y: y }, end: { x: 470, y: y }, thickness: 0.7, color: ink });
                y -= 16;
                centered(value(party.nome).toUpperCase(), bold, 9.5, y, ink);
                y -= 14;
                centered('CPF: ' + value(party.cpf), regular, 8.8, y, muted);
                y -= 34;
            });
        }

        addPage(true);
        centered('CONTRATO PARTICULAR DE COMPROMISSO', bold, 12.5, y, navy);
        centered('DE COMPRA E VENDA DE IMÓVEL', bold, 12.5, y - 18, navy);
        y -= 52;

        var sellersPlural = (data.sellers || []).length > 1;
        var buyersPlural = (data.buyers || []).length > 1;
        var sellerSubject = sellersPlural ? 'Os VENDEDORES' : 'O VENDEDOR';
        var sellerReference = sellersPlural ? 'os VENDEDORES' : 'o VENDEDOR';
        var sellerOf = sellersPlural ? 'dos VENDEDORES' : 'do VENDEDOR';
        var sellerTo = sellersPlural ? 'aos VENDEDORES' : 'ao VENDEDOR';
        var sellerPronoun = sellersPlural ? 'estes' : 'este';
        var buyerSubject = buyersPlural ? 'Os COMPRADORES' : 'O COMPRADOR';
        var buyerObject = buyersPlural ? 'os COMPRADORES' : 'o COMPRADOR';
        var buyerOf = buyersPlural ? 'dos COMPRADORES' : 'do COMPRADOR';
        var buyerTo = buyersPlural ? 'aos COMPRADORES' : 'ao COMPRADOR';
        var buyerBy = buyersPlural ? 'pelos COMPRADORES' : 'pelo COMPRADOR';

        label(sellersPlural ? 'PROPONENTES VENDEDORES' : 'PROPONENTE VENDEDOR');
        (data.sellers || []).forEach(function (person) {
            var seller = qualification(person);
            richParagraph([{ text: seller.name, font: bold }, { text: seller.details, font: regular }], { after: 7 });
        });
        y -= 4;
        label(buyersPlural ? 'PROPONENTES COMPRADORES' : 'PROPONENTE COMPRADOR');
        (data.buyers || []).forEach(function (person) {
            var buyer = qualification(person);
            richParagraph([{ text: buyer.name, font: bold }, { text: buyer.details, font: regular }], { after: 7 });
        });
        y -= 4;
        paragraph('As partes acima qualificadas resolvem celebrar o presente Contrato Particular de Compromisso de Compra e Venda, mediante as cláusulas e condições abaixo:');

        clauseTitle('CLÁUSULA 1 – DO OBJETO E IMÓVEL');
        paragraph('O presente contrato tem por objeto a promessa de compra e venda do imóvel de propriedade ' + sellerOf + ', livre e desembaraçado de quaisquer ônus que impeçam sua transferência, conforme a matrícula imobiliária nº ' + value(data.property.registration) + ', registrada no ' + value(data.property.registry) + ', referente ao imóvel situado no endereço ' + value(data.property.address) + ', bairro ' + value(data.property.district) + ', ' + value(data.property.city) + ' - ' + value(data.property.state) + ', CEP ' + value(data.property.postalCode) + '.');

        clauseTitle('CLÁUSULA 2 – DO PREÇO');
        paragraph('O preço certo e ajustado para a presente compra e venda é de ' + amountWithWords(data.payment.total) + '.');

        clauseTitle('CLÁUSULA 3 – DA FORMA DE PAGAMENTO');
        var paymentItems = [];
        if (hasPositiveAmount(data.payment.deposit)) paymentItems.push('Sinal: ' + amountWithWords(data.payment.deposit) + ', pago ' + buyerBy + ' ' + sellerTo + ' no ato da assinatura deste contrato de compra e venda.');
        if (hasPositiveAmount(data.payment.fgts)) paymentItems.push('FGTS: ' + amountWithWords(data.payment.fgts) + ', mediante utilização dos recursos do FGTS ' + buyerOf + ', por ocasião da contratação do financiamento.');
        if (hasPositiveAmount(data.payment.downPayment)) paymentItems.push('Entrada: ' + amountWithWords(data.payment.downPayment) + ', a ser paga na data da assinatura da escritura/contrato de financiamento junto à instituição financeira.');
        if (hasPositiveAmount(data.payment.financing)) paymentItems.push('Financiamento bancário: ' + amountWithWords(data.payment.financing) + ', a ser pago diretamente pela instituição financeira ' + sellerTo + '.');
        var paymentAccount = 'O preço será pago na conta corrente ' + sellerOf + ', mantida no Banco ' + value(data.payment.bank) + ', agência nº ' + value(data.payment.branch) + ', conta corrente nº ' + value(data.payment.account);
        paragraph(paymentAccount + (paymentItems.length ? ', da seguinte forma:' : ', conforme ajustado entre as partes.'));
        paymentItems.forEach(function (item, index) {
            paragraph(String.fromCharCode(97 + index) + ') ' + item, { after: index === paymentItems.length - 1 ? 8 : 5 });
        });

        clauseTitle('CLÁUSULA 4 – DO PRAZO PARA PAGAMENTO DO FINANCIAMENTO');
        paragraph('As partes convencionam que o pagamento do valor financiado pela instituição financeira deverá ocorrer em até ' + value(data.signature.financingDays) + ' dias, contados da assinatura do presente contrato. O prazo poderá ser prorrogado mediante acordo entre as partes ou em razão de exigências formuladas pela instituição financeira ou pelo cartório competente.');
        paragraph((sellersPlural ? 'Ficam cientes os VENDEDORES' : 'Fica ciente o VENDEDOR') + ' de que, a partir da data de emissão do contrato bancário, o saldo a ser liberado por meio do financiamento será atualizado pelos índices aplicáveis à caderneta de poupança. O valor creditado ' + sellerTo + ' será líquido dos encargos financeiros, incluindo juros e IOF, quando incidentes, conforme as regras da instituição financeira.');
        paragraph('Caso o saldo do financiamento não seja creditado ' + sellerTo + ' no prazo de ' + value(data.signature.terminationDays) + ' dias, contados da assinatura do presente contrato, ' + sellerSubject + (sellersPlural ? ' poderão' : ' poderá') + ' rescindir a presente negociação sem qualquer penalidade.');

        clauseTitle('CLÁUSULA 5 – DA APROVAÇÃO DO FINANCIAMENTO');
        paragraph(buyerSubject + (buyersPlural ? ' comprometem-se' : ' compromete-se') + ' a apresentar toda a documentação necessária à análise do crédito e à contratação do financiamento.');
        paragraph(sellerSubject + (sellersPlural ? ' comprometem-se' : ' compromete-se') + ' a fornecer toda a documentação pessoal e do imóvel necessária para viabilizar a operação.');

        clauseTitle('CLÁUSULA 6 – DA NEGATIVA DO FINANCIAMENTO');
        paragraph('Na hipótese de o financiamento ser negado, por qualquer motivo, no decorrer do processo, serão aplicadas as seguintes condições:');
        bullet('Em caso de desistência ' + buyerOf + ', será devolvido 100% (cem por cento) do valor pago a título de entrada e 80% (oitenta por cento) do valor pago a título de sinal, ficando retidos 20% (vinte por cento) do sinal para cobertura de despesas administrativas e em razão da indisponibilidade do imóvel durante o período em que permaneceu reservado para a presente negociação.');
        bullet('A devolução ocorrerá no prazo máximo de 5 (cinco) dias úteis, contados da comunicação formal da negativa do financiamento.');
        bullet('Nenhuma das partes poderá exigir multa, indenização ou perdas e danos em razão da rescisão motivada pela não aprovação do financiamento.');

        clauseTitle('CLÁUSULA 7 – DA ESCRITURA');
        paragraph('A escritura definitiva, ou o contrato de financiamento com força de escritura pública, será assinada após a aprovação do crédito e o cumprimento das exigências da instituição financeira.');

        clauseTitle('CLÁUSULA 8 – DOS TRIBUTOS, TAXAS E DESPESAS CONDOMINIAIS');
        paragraph(sellerSubject + (sellersPlural ? ' declaram' : ' declara') + ' que o imóvel será entregue livre e desembaraçado de quaisquer débitos anteriores à assinatura da escritura definitiva. Serão de responsabilidade ' + sellerOf + ':');
        bullet('IPTU incidente até a data da assinatura da escritura; taxas condominiais ordinárias e extraordinárias vencidas até a assinatura da escritura; contas de água, energia elétrica, gás e demais encargos vencidos até a entrega das chaves.');
        paragraph('A partir da assinatura da escritura definitiva e da imissão na posse, todos os tributos, taxas, contribuições, despesas condominiais e encargos incidentes sobre o imóvel passarão a ser de responsabilidade exclusiva ' + buyerOf + '.');
        paragraph('Caso seja identificado, após a assinatura da escritura definitiva, qualquer débito de responsabilidade ' + sellerOf + ', ' + sellerPronoun + (sellersPlural ? ' comprometem-se' : ' compromete-se') + ' a quitá-lo em até 5 (cinco) dias úteis, isentando ' + buyerObject + ' de qualquer prejuízo.');

        clauseTitle('CLÁUSULA 9 – DAS CERTIDÕES E DOCUMENTAÇÃO');
        paragraph(sellerSubject + (sellersPlural ? ' comprometem-se' : ' compromete-se') + ' a apresentar toda a documentação exigida pela instituição financeira, pelo Cartório de Registro de Imóveis e pelos demais órgãos competentes, inclusive as certidões pessoais e do imóvel.');
        paragraph(buyerSubject + (buyersPlural ? ' comprometem-se' : ' compromete-se') + ' a fornecer toda a documentação necessária à aprovação do financiamento e à assinatura da escritura.');

        clauseTitle('CLÁUSULA 10 – DA CONSERVAÇÃO DO IMÓVEL');
        paragraph('Até a entrega das chaves, ' + sellerReference + (sellersPlural ? ' comprometem-se' : ' compromete-se') + ' a manter o imóvel nas mesmas condições em que foi apresentado ' + buyerTo + ', respondendo por eventuais danos decorrentes de culpa ou negligência.');

        clauseTitle('CLÁUSULA 11 – DA IRREVOGABILIDADE');
        paragraph('Após a aprovação do financiamento e cumpridas todas as condições previstas neste contrato, o presente compromisso torna-se irretratável e irrevogável, obrigando as partes, seus herdeiros e sucessores.');
        paragraph('Ressalva-se, entretanto, a hipótese prevista na Cláusula 6 (não aprovação do financiamento), caso em que serão aplicadas as condições de devolução nela previstas.');

        clauseTitle('CLÁUSULA 12 – DAS DESPESAS DE ESCRITURA E REGISTRO');
        paragraph('Salvo ajuste diverso entre as partes:');
        bullet('As despesas com ITBI, escritura, quando aplicável, registro do imóvel e demais custos relacionados à aquisição serão de responsabilidade ' + buyerOf + '.');
        bullet('As eventuais despesas necessárias à regularização documental do imóvel ou ' + sellerOf + ', exigidas para viabilizar a venda, serão de responsabilidade ' + sellerOf + '.');

        clauseTitle('CLÁUSULA 13 – DAS PENALIDADES');
        paragraph('Em caso de desistência injustificada por parte ' + buyerOf + ', o valor pago a título de sinal permanecerá em favor ' + sellerOf + '. Se a desistência injustificada ocorrer por parte ' + sellerOf + ', ' + sellerPronoun + (sellersPlural ? ' restituirão' : ' restituirá') + ' ' + buyerTo + ' o valor do sinal em dobro.');

        clauseTitle('CLÁUSULA 14 – DAS DISPOSIÇÕES GERAIS');
        paragraph('As partes declaram que:');
        bullet('celebram o presente contrato de livre e espontânea vontade;');
        bullet('leram e compreenderam todas as suas cláusulas;');
        bullet('inexistem vícios de consentimento que possam invalidar este instrumento;');
        bullet('comprometem-se a agir com boa-fé durante todo o processo de financiamento e transferência da propriedade.');
        paragraph('Qualquer alteração deste contrato somente terá validade mediante termo aditivo assinado por todas as partes.');

        clauseTitle('CLÁUSULA 15 – DA POSSE DO IMÓVEL');
        paragraph('A posse direta do imóvel será transmitida ' + buyerTo + ' após o pagamento integral do preço de venda, incluindo os valores de FGTS e de financiamento bancário, e o registro da transferência da propriedade em favor ' + buyerOf + ' na matrícula do imóvel. Nessa ocasião, ' + sellerReference + (sellersPlural ? ' entregarão' : ' entregará') + ' as chaves ' + buyerTo + '.');

        clauseTitle('CLÁUSULA 16 – DO FORO');
        paragraph('Fica eleito o foro da comarca onde estiver situado o imóvel para dirimir quaisquer dúvidas oriundas deste contrato, renunciando as partes a qualquer outro, por mais privilegiado que seja. Por estarem justas e contratadas, as partes assinam o presente instrumento em duas vias de igual teor.');

        ensure(50);
        y -= 18;
        centered(value(data.signature.city) + ', ' + longDate(data.signature.date) + '.', regular, 10.5, y, ink);
        y -= 52;
        signatures(sellersPlural ? 'ASSINATURAS DOS VENDEDORES' : 'ASSINATURA DO VENDEDOR', data.sellers || []);
        signatures(buyersPlural ? 'ASSINATURAS DOS COMPRADORES' : 'ASSINATURA DO COMPRADOR', data.buyers || []);

        pages.forEach(function (currentPage, index) {
            currentPage.drawLine({ start: { x: 55, y: 40 }, end: { x: 540, y: 40 }, thickness: 0.45, color: gold });
            currentPage.drawText('Premium Assessoria Imobiliária', { x: 55, y: 24, size: 7.2, font: regular, color: muted });
            var website = 'www.assessoriapremium.com.br';
            currentPage.drawText(website, { x: 297.5 - regular.widthOfTextAtSize(website, 7.2) / 2, y: 24, size: 7.2, font: regular, color: muted });
            var pageNumber = 'Página ' + (index + 1) + ' de ' + pages.length;
            currentPage.drawText(pageNumber, { x: 540 - regular.widthOfTextAtSize(pageNumber, 7.2), y: 24, size: 7.2, font: regular, color: muted });
        });
        return document.save();
    }

    global.PremiumPurchaseContractPdf = { createPdfBytes: createPdfBytes, currencyInWords: currencyInWords };
}(typeof window !== 'undefined' ? window : globalThis));
