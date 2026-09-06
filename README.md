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

## Soru boyutu ve serbest yerleşim

- Soru kartındaki **Boyut / yerleşim** menüsünden yalnız o sorunun boyutunu değiştirin; tam genişlik, ayrı sayfa veya yeni sayfa/sütun başlangıcı seçin. Büyük bir kırpma diğer soruları küçültmez.
- Metinli PDF sorularında **Baskı** değeri, çıktıdaki baskın yazı puntosunun yaklaşık değeridir. **Çıktı** sekmesindeki okunabilirlik sınırının altında kalan sorular ayrıca gösterilir. Görsel ve taramalarda punto ölçülemez.
- **A4 Önizleme** üzerinde bir soruya tıklamak yalnızca o soruyu seçer; sürüklemek soruyu boş alana taşır. Kırpma, soru ayar menüsündeki **Kırpmayı düzenle** ile açılır. Alt/üst kenara yaklaştırıldığında sayfalar kayar. **Soru için sayfa ekle** ile testin sonuna hedef sayfa açılır; boş sayfadaki açıklama taşıma adımını gösterir. Bu boş sayfa, üzerine soru yerleştirildiğinde çıktıya katılır.
- Başlık tasarımı veya yüksekliği değiştiğinde ilk sayfadaki elle yerleştirilmiş sorular başlığın altına uyarlanır. Sığmayan sorular otomatik akışa alınır; diğer konumlar korunur.
- Soru üzerindeki ayar düğmesi **Kırpmayı düzenle**, **Boyut / yerleşim** ve **Konum seç** araçlarını açar. Bu araçlar önizlemede sürekli yer kaplamaz. **Konum seç** aracı sürüklemeye alternatif sunar. Ok tuşları 1, Shift + ok tuşları 10 birim taşır. Taşıma numaraları değiştirmez; üst üste gelen konumlar kabul edilmez. Elle yerleştirilmiş sorular **Otomatik yerleşime dön** ile akışa alınabilir.
- Kırpma çerçevesinin içinden taşıyın veya dört köşeden boyutlandırın. Çerçeve/köşe odaktayken ok tuşlarıyla ince ayar yapın. PDF ve görseller 90° adımlarla döndürülebilir.
- Çerçevenin hemen altındaki küçük kutulardan cevabı seçip **Ekle** düğmesini kullanın. Mevcut bir soruda düğme **Güncelle** olur.
- Boş önizleme sayfaları üzerlerindeki **Sayfayı sil** düğmesiyle kaldırılabilir. Sonraki sayfalar yeniden numaralanır; sorular korunur.
- **Soruları otomatik bul**, açık PDF sayfasındaki soru alanlarını işaretler. Sonrasında görünen **Tüm soruları ekle** ile bu alanları tek işlemde ekleyin. Aynı kırpma tekrar eklenmez; toplu ekleme tek adımda geri alınabilir.
