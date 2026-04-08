const { chromium } = require('playwright');

// Complete Google session cookies
const cookies = [
  { name: '__Secure-1PSIDCC', value: 'AKEyXzUE4olU1018Dc08pYj2cWsBDXZTWBbvc0qAB3pYsSCDTlvCJkvQ2sCDufl5VAvzkhiFOA', domain: '.google.com', path: '/', secure: true, httpOnly: true },
  { name: '__Secure-1PSIDTS', value: 'sidts-CjEBWhotCS0jwhqAwXcRNRQ8nYOTt7pgi_F07v8DIPqyo-1KVeeza_D6DB7CmKa-5WI1EAA', domain: '.google.com', path: '/', secure: true, httpOnly: true },
  { name: '__Secure-3PAPISID', value: '5SbIR9MfhIhv_O-E/ArSkpYiIzg50I8Zyt', domain: '.google.com', path: '/', secure: true, httpOnly: false },
  { name: '__Secure-3PSID', value: 'g.a0008Qh5xCqTGGISCcuQ8XQbmz_SXKCxhTDbV_mhb3RoWms4_2yjXcEXDXIEdYtTXoS0HQ94ygACgYKAVkSARUSFQHGX2MiJ7aFynSECfPB3BFr18oD4BoVAUF8yKrRoKm6A1jh9_boG6IxezSe0076', domain: '.google.com', path: '/', secure: true, httpOnly: true },
  { name: '__Secure-3PSIDCC', value: 'AKEyXzVhbLGlT7nhx0KCFkVAdmoLfjx6AFhPHIFTdxQp71gXR74Kw3yeyQKsVJQKll5lAs-wcSQ', domain: '.google.com', path: '/', secure: true, httpOnly: true },
  { name: '__Secure-3PSIDTS', value: 'sidts-CjEBWhotCS0jwhqAwXcRNRQ8nYOTt7pgi_F07v8DIPqyo-1KVeeza_D6DB7CmKa-5WI1EAA', domain: '.google.com', path: '/', secure: true, httpOnly: true },
  { name: '__Secure-BUCKET', value: 'CO0B', domain: '.google.com', path: '/', secure: true, httpOnly: true },
  { name: '__Secure-STRP', value: 'AEEP7gL21Akvih0xOdxPaOnFZa_Xb-rP85p2QNwz8FWWIL-Raf4OHNsEFmt6FPLUIAbpBhurNMWaAVKGpwfoS39LgHWAgZlkMx63', domain: '.google.com', path: '/', secure: true, httpOnly: false },
  { name: 'AEC', value: 'AaJma5tVTE5TJ3ZROcKmCTTveeM4L0uG7L9UgYDCLY1ebW1CqUzhZXNNvuM', domain: '.google.com', path: '/', secure: true, httpOnly: false },
  { name: 'APISID', value: 'bSX1fyKslHzanE3m/A9YHFCJSHD9jutQyP', domain: '.google.com', path: '/', secure: false, httpOnly: false },
  { name: 'CONSISTENCY', value: 'AKctkzkG3Z1pKvSEeBexDbtQd30sz7JwWw1SWaxEqZpCIlGPXnTshmKdDUzSWzXuG56F9W91D9y97c-9JWe-pb9S0GbSUEUJLl5KeBPk6Z_pdo0zy1e72Z-X1kjhmav9gaL1qvEDscdZYzEB-f4R1W_i0NKf_s3f3I5po1axOKxwgorCf2HC0Vcm5h9LYhiEmnerayzKGaPmRM16BJAP2PeQON2wbpdKVN044kjYPyayuYyvbv3jmuBoip-UcnmaGYDzzprw_X4W', domain: '.google.com', path: '/', secure: true, httpOnly: false },
  { name: 'GOOGLE_ABUSE_EXEMPTION', value: 'ID=6762f098c848b97b:TM=1774866770:C=R:IP=116.212.132.113-:S=HJrXhTPqX_sphJT1B96QH-w', domain: '.google.com', path: '/', secure: false, httpOnly: false },
  { name: 'HSID', value: 'ASJksKeyafn5P5Nt5', domain: '.google.com', path: '/', secure: false, httpOnly: true },
  { name: 'NID', value: '530=RrXAjjVR7dXrjr8gGmneVQcRdYu6oy88-n-8ZNX63k1BS7e41vudYHa2F4oWTL8l_ohwi0LUvu10MdVE0gDT2JhEsNzu54nL4hxSiFkeDoyyMnqTQLF-2mKSRl2L2yKHz-qPlxs5YaDViqqLYeYNEiAQdeRJbKtQ-2vVj904NNS6MxtyoM8vxWTQyI2UG6lJOxfD7kyw9kmllSgq8k8CBlzUT4nwjc8W8vpMguu8z8QGh2pWZQfQAU6_gop9gZNv2pr1DQpA-rUJu_Q_Q_nOrwMPFTS2qBkvvn4PDypp4foqM8wRkqB56WVnJnpfrMWJn7Rjf6f-TIPWeK_d_uDiLmdkWFBUFP2ttGdVCYXtUUNtxQLTaAYUScM6p6OnnihGRmhdyP9QjvInt3abR93JVU4E4M6gfH_hK5LAY9e4DuBYxD5JQrmHJ-_skBShZeJQXAZPSt_YnhAi4GfTrhc2vgjE54dxPZiN9G5VnvJxKuF4P8K0se12BH_b8xsRtoCfudI6Sx_2fcfBX8rafXdoNEcbxqpyS_rxenzCtGDNfkRpchIBZad0KGw6Pu6JpkszR9pFlvYyh4VlWNG4LxpreWFggiwoaodZx23N42rWa2Z45-49mVbwto19CJR1J_O8Z5Zly1K70pwJByG1jrNvANsOfLwWAc_Tsvroj8fZyaRVCb705bGOyvZG1v5foonUfev89u49yxhDHatVo4bxN_CMfOVJ5RqUPZ8IwuGQJJ9ibTRL_KvFGDcqjzxNSQsiT3VeRBNZdCGecXs2dyJlmVd_1mrtw3gR4WgPF7qiRzDGg-Tl6iI91JPkzJ6StyMgo5zI_EuSHidJ1VKnqKS9GTWSKIzmeLIdjFV7TM-ldlwDtxjKnbP6JibCcwt2ovncFrmP8BXyIrlHw1gWJuRNTlgOBo5L378pSsU5c3I8JFSoavx4sR451Dlei8Kc1G2vQdX3h6rrleol8YCuOsnr1JS-S8vp8ZtsJhBni3G4rwUzrkaWKjPwl4azAdcWZFfvXXUtRb4qF-LCdyFveW-bpoOyBLVR7Q9aKFGr-kpVtyIjoyXSeTlVMDa3HFcPWB68-ho8J8lNE6UAfSvz7K2eu1pa5ZhLGVVKVKQuyYdovRMdOZJPqsV4xKVqE-5y9xKZsi7EDVXpijw4UySfGdL89rrq2UQhhzUuWyfFp8lKMJH1jkdNn9gDRm_Be4X4a1XVYUgeyMrstLnP9XzloZwEiN6EwZktjOZPyYLjQd6P2tR1FRyM53utzOaRyAapwXfcmGqIOj7-oH82r_I3MvSJd6Dp7g6J3xxuEVPyj1aa3cBvXeMpe0VAEXH_q92k_URDnSDQ6dLf4UNhRP9TmTKFprwUf7cBctWAmlzL1nRiqB19_9S6RN5Y4LOcyqwF4MEXoCbB6zM2DIg6', domain: '.google.com', path: '/', secure: false, httpOnly: true },
  { name: 'OTZ', value: '8508449_28_28__28_', domain: 'accounts.google.com', path: '/', secure: false, httpOnly: false },
  { name: 'SAPISID', value: '5SbIR9MfhIhv_O-E/ArSkpYiIzg50I8Zyt', domain: '.google.com', path: '/', secure: true, httpOnly: false },
  { name: 'SEARCH_SAMESITE', value: 'CgQIr6AB', domain: '.google.com', path: '/', secure: false, httpOnly: false },
  { name: 'SID', value: 'g.a0008Qh5xCqTGGISCcuQ8XQbmz_SXKCxhTDbV_mhb3RoWms4_2yj-6NtvCflm6mMM71owQnvMgACgYKAVwSARUSFQHGX2MiexznSxHs5XtIYgAujZnccBoVAUF8yKohh3XpHoj5hzGX35eWF56B0076', domain: '.google.com', path: '/', secure: false, httpOnly: true },
  { name: 'SIDCC', value: 'AKEyXzXNyGHsUlYLsN-0G1O5-95MVbZorlmG2wXVFzD6sdyYjJWAD5wITcGFQJkT0kIDS9Fdeg', domain: '.google.com', path: '/', secure: false, httpOnly: true }
];

async function main() {
  console.log('Launching browser...');
  const browser = await chromium.launchPersistentContext('/tmp/sarawan-google-session', {
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  // Add cookies via CDP context
  console.log('Injecting cookies...');
  await browser.addCookies(cookies);

  const page = browser.pages()[0] || await browser.newPage();
  
  // Test if Google session works
  console.log('Testing Google session...');
  await page.goto('https://myaccount.google.com', { waitUntil: 'networkidle' });
  
  // Take screenshot
  await page.screenshot({ path: '/tmp/google-session-test.png', fullPage: true });
  console.log('Screenshot saved to /tmp/google-session-test.png');
  
  // Check if we're logged in
  const url = page.url();
  if (url.includes('signin') || url.includes('ServiceLogin')) {
    console.log('❌ NOT logged in - still on sign-in page');
    console.log('URL:', url);
  } else {
    console.log('✅ Logged in to Google!');
    console.log('URL:', url);
  }
  
  // Keep browser open for manual inspection
  console.log('\nBrowser open. Press Ctrl+C to close.');
  await new Promise(() => {});
}

main().catch(console.error);
