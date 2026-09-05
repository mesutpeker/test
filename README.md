# Test Atölyesi

PDF ve görsellerden soru seçerek düzenli, baskıya hazır A4 testleri oluşturur.

**Uygulama:** https://mesutpeker.online/test/

PDF ve görseller tarayıcıda işlenir. Kullanıcının yüklediği dosyalar sunucuya gönderilmez.

## Özellikler

- PDF, PNG, JPG ve WebP kaynaklarından soru kırpma
- Geniş soru seçme penceresi, yakınlaştırma ve döndürme
- Numaralı PDF sorularının sınırlarını bulma; kaynak numarasını seçim dışında bırakma
- Soru seçerken doğru cevabı işaretleme
- Soru sıralama ve uygulamanın otomatik numaralandırması
- A4, bir veya iki sütun, ortak soru boyutu ve düzenli boşluklar
- Sütun çizgisi, çizgi renkleri, soru numarası rengi ve stili
- Vektör PDF veya 300/600 DPI çıktı, isteğe bağlı cevap anahtarı

## Yerelde çalıştırma

Node.js 22.19 veya daha yeni bir Node.js 22 sürümü gerekir.

```sh
npm ci
npm run dev
```

Terminalde gösterilen yerel adresi açın (genellikle http://localhost:3000).

## GitHub Pages

```sh
npm run build:pages
node scripts/verify-pages.mjs
```

Statik yayın dosyaları `dist/client/test/` klasörüne çıkar. Bu klasörün içeriği `/test/` adresinde sunulur. Kaynaklar, PDF worker dosyası ve yazı tipleri bu yola göre hazırlanır.

GitHub reposunun **Settings → Pages** bölümünde kaynak **GitHub Actions** olmalıdır. `main` dalına gönderilen değişiklikler `.github/workflows/pages.yml` tarafından test edilip yayımlanır. `mesutpeker.github.io` ana sitesinin alan adı sayesinde proje `https://mesutpeker.online/test/` adresinden açılır.

Standart `npm run build` komutu mevcut Sites/Cloudflare derleme desteğini korur. GitHub Pages derlemesi sunucu veya Sites oturumu gerektirmez.

## Kontroller

```sh
npx tsc --noEmit
npm run lint
npm test
```

Kaynak PDF numaralarının doğru ayrılması, soru içeriğinin korunması ve Safari uyumlu PDF metin okuma için testler bulunur. Metin katmanı olmayan veya numarası güvenle ayrılamayan kaynaklarda sorular elle seçilebilir.

`public/fonts` ve `public/pdfjs` klasörlerindeki üçüncü taraf dosyalarının lisansları ilgili klasörlerdedir.
