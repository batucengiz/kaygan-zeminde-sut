# Kaygan Zeminde Şut – kayıt sitesi

16 kişilik kontenjanlı kayıt sitesi. Katılımcılar ve yönetici hesapsız girer.

## Bilgisayarında çalıştırma
Node.js 18 veya üstü gerekir.

    ADMIN_PASSWORD=sifren node server.js

Windows PowerShell: `$env:ADMIN_PASSWORD="sifren"; node server.js`

Sonra tarayıcıda http://localhost:3000 adresini aç.

## Yönetici
Sayfanın sağ üstündeki "Yönetici girişi" düğmesi. Şifre kodda tutulmaz; `ADMIN_PASSWORD` ortam değişkeniyle verilir.
Tanımlı değilse yönetici girişi kapalıdır.

## Ayarlar (ortam değişkenleri)
- `PORT`: dinlenecek port (varsayılan 3000)
- `ADMIN_PASSWORD`: yönetici şifresi
- `DATA_DIR`: kayıtların tutulduğu klasör (data.json burada oluşur)

## İnternette yayınlama (Render)
1. Bu klasörü bir GitHub deposuna yükle.
2. render.com'da "New > Web Service" ile depoyu seç. `render.yaml` ayarları otomatik doldurur.
3. `ADMIN_PASSWORD` değerini gir ve yayınla. Çıkan adres sitenin adresidir.

Ücretsiz planda disk kalıcı değildir: sunucu yeniden başlarsa kayıtlar silinir.
Kayıtlar önemliyse ücretli plana kalıcı disk ekleyip `DATA_DIR` değerini o diske yönlendir
ya da etkinlikten önce yönetici panelindeki "Listeyi kopyala" ile listeyi sakla.
