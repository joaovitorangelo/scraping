const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { chromium } = require('playwright');
const https = require('https');
const db = require('./db.js');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.on('ready', () => {
  console.log(`Bot ${client.user.tag} está online!`);
});

client.on('messageCreate', async (message) => {
  if (message.content.startsWith('!ofertas')) {
    // Configurações do scraping
    try {
      message.reply('🔍 Realizando scraping, aguarde...');
      const browser = await chromium.launch();
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36'
      });
      const page = await context.newPage();
      
      const ofertas = [];
      for ( const site of db ) {
        try {
          await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
          // Flags de cada site
          let products;
          switch (site.name) {
            case 'kabum': 
              products = await getProducts(
                page, 
                '.productCard', 
                '.imageCard', 
                '.nameCard', 
                '.priceCard', 
                '.productLink', 
                'https://www.kabum.com.br'
              );
              break;
            case 'pichau':
              products = await getProducts(
                page, 
                '.mui-p3mq1s', 
                '.mui-rfxowm-media', 
                '.mui-1jecgbd-product_info_title-noMarginBottom', 
                '.mui-1q2ojdg-price_vista', 
                '[data-cy="list-product"]', 
                'https://www.pichau.com.br' 
              );
              break;
            case 'terabyteshop':
                products = await getProducts(
                  page, 
                  '.product-item__grid', 
                  '.image-thumbnail',
                  '.product-item__name h2', 
                  '.product-item__new-price span', 
                  '.product-item__name', 
                  '' 
                );
              break;
          }

          if (products.length > 0) {
            ofertas.push({ site: site.name, ofertas: products });
          } else {
            console.log(`❌ Nenhum produto encontrado em ${site.name}.`);
          }
        } catch (err) {
          console.error(`⚠️ Erro ao processar ${site.name}:`, err.message);
        } 
      }

      await browser.close();
      
      console.log(JSON.stringify(ofertas, null, 2));
      // Exibe os produtos no chat
      if (ofertas.length !== 0) {
        for (const site of ofertas) {
          for (const oferta of site.ofertas) {
            try {
              const imageBuffer = await downloadImage(oferta.image);
              
              await message.channel.send({
                files: [{ attachment: imageBuffer, name: 'product.jpg' }],
                embeds: [
                  new EmbedBuilder()
                    .setTitle(oferta.name)
                    .setDescription(oferta.price)
                    .setURL(oferta.url)
                    .setFooter({ text: site.site })
                ]
              });
            } catch (err) {
              console.error(`Erro ao enviar imagem: ${err.message}`);
              await message.channel.send({
                embeds: [
                  new EmbedBuilder()
                    .setTitle(oferta.name)
                    .setDescription(oferta.price)
                    .setImage('https://thumbs.dreamstime.com/b/simple-adorable-orange-tabby-cat-sleeping-outlined-216146128.jpg')
                    .setURL(oferta.url)
                    .setFooter({ text: site.site })
                ]
              });
            }
          }
        }
        await message.reply('✅ Scraping concluído!');
      } else {
        message.reply('❌ Nenhuma oferta encontrada.');
      }
      // Função para baixar imagem usando https
      async function downloadImage(url) {
        return new Promise((resolve, reject) => {
          https.get(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36',
              'Accept': 'image/*',
            },
          }, (res) => {
            const data = [];

            // Verificar se o tipo de conteúdo é uma imagem
            const contentType = res.headers['content-type'];
            if (!contentType || !contentType.startsWith('image/')) {
              reject(new Error('O conteúdo não é uma imagem.'));
              return;
            }

            res.on('data', (chunk) => data.push(chunk));
            res.on('end', () => {
              const buffer = Buffer.concat(data);
              resolve(buffer);
            });

            res.on('error', (err) => reject(err));
          }).on('error', (err) => reject(err));
        });
      }
    } catch (error) {
      console.error(error);
      message.reply('❌ Erro ao realizar o scraping.');
    }
  }
});
// 
async function getProducts(page, productCard, imageCard, nameCard, priceCard, productLink, baseUrl) {
  try {
    await page.waitForSelector(productCard, { timeout: 30000 });
  } catch (err) {
    console.error(`⚠️ Seletor de produto não encontrado: ${productCard}`);
    return [];
  }
  const products = await page.evaluate(({ productCard, imageCard, nameCard, priceCard, productLink, baseUrl }) => {
    return Array.from(document.querySelectorAll(productCard)).map(card => {
      const imageElement = card.querySelector(imageCard);
      const nameElement = card.querySelector(nameCard);
      const priceElement = card.querySelector(priceCard);
      const linkElement = card.querySelector(productLink);

      return {
        image: imageElement ? imageElement.getAttribute('src') : 'Imagem não encontrada',
        name: nameElement ? nameElement.textContent.trim() : 'Nome não encontrado',
        price: priceElement ? priceElement.textContent.trim() : 'Preço não encontrado',
        url: linkElement ? baseUrl + linkElement.getAttribute('href') : 'URL não encontrada'
      };
    }).filter(
      product => product.image !== 'Imagem não encontrada' &&
      product.name !== 'Nome não encontrado' && 
      product.price !== 'Preço não encontrado' &&
      product.url !== 'URL não encontrada'
    );
  }, 
  { 
    productCard, 
    imageCard, 
    nameCard, 
    priceCard, 
    productLink, 
    baseUrl 
  });

  return products;
}

client.login(process.env.DISCORD_TOKEN);
