새로운 (매매 한정) api 데이터 소스를 받아왔어.
아까보다 더 정교한 정보들을 제공하므로, 이 api를 사용하고 수정해줘.

어떤 기대 효과가 있을지도 얘기해주고.

https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev?LAWD_CD=11110&DEAL_YMD=202001&serviceKey=8f97f3a5dcd13fc659261ce388609c692817e07d17f18e25304a9233f01b19f4&pageNo=1&numOfRows=4000

이러한 URL로 받아오게 돼.
pageNo는 1, numOfRows는 4000 고정으로 써 주고, LAWD_CD는 법정시군구코드, DEAL_YMD는 YYYYMM 형식. serviceKey는 .env의 MOLIT_API_KEY 키야.

예시는

<?xml version="1.0" encoding="utf-8" standalone="yes"?>
  <response>
    <header>
      <resultCode>000</resultCode>
      <resultMsg>OK</resultMsg>
    </header>
    <body>
      <items>
        <item>
          <aptDong>
          </aptDong>
          <aptNm>창신쌍용1</aptNm>
          <aptSeq>11110-37</aptSeq>
          <bonbun>0702</bonbun>
          <bubun>0000</bubun>
          <buildYear>1992</buildYear>
          <buyerGbn>
          </buyerGbn>
          <cdealDay>
          </cdealDay>
          <cdealType>
          </cdealType>
          <dealAmount>31,000</dealAmount>
          <dealDay>3</dealDay>
          <dealMonth>1</dealMonth>
          <dealYear>2020</dealYear>
          <dealingGbn>
          </dealingGbn>
          <estateAgentSggNm>
          </estateAgentSggNm>
          <excluUseAr>54.7</excluUseAr>
          <floor>5</floor>
          <jibun>702</jibun>
          <landCd>1</landCd>
          <landLeaseholdGbn>N</landLeaseholdGbn>
          <rgstDate>
          </rgstDate>
          <roadNm>동망산길</roadNm>
          <roadNmBonbun>00019</roadNmBonbun>
          <roadNmBubun>00000</roadNmBubun>
          <roadNmCd>4100065</roadNmCd>
          <roadNmSeq>01</roadNmSeq>
          <roadNmSggCd>11110</roadNmSggCd>
          <roadNmbCd>0</roadNmbCd>
          <sggCd>11110</sggCd>
          <slerGbn>
          </slerGbn>
          <umdCd>17400</umdCd>
          <umdNm>창신동</umdNm>
        </item>
        <item>
          <aptDong>
          </aptDong>
          <aptNm>삼성</aptNm>
          <aptSeq>11110-73</aptSeq>
          <bonbun>0596</bonbun>
          <bubun>0000</bubun>
          <buildYear>1998</buildYear>
          <buyerGbn>
          </buyerGbn>
          <cdealDay>
          </cdealDay>
          <cdealType>
          </cdealType>
          <dealAmount>53,000</dealAmount>
          <dealDay>13</dealDay>
          <dealMonth>1</dealMonth>
          <dealYear>2020</dealYear>
          <dealingGbn>
          </dealingGbn>
          <estateAgentSggNm>
          </estateAgentSggNm>
          <excluUseAr>84.93</excluUseAr>
          <floor>6</floor>
          <jibun>596</jibun>
          <landCd>1</landCd>
          <landLeaseholdGbn>N</landLeaseholdGbn>
          <rgstDate>
          </rgstDate>
          <roadNm>평창문화로</roadNm>
          <roadNmBonbun>00172</roadNmBonbun>
          <roadNmBubun>00000</roadNmBubun>
          <roadNmCd>3100023</roadNmCd>
          <roadNmSeq>01</roadNmSeq>
          <roadNmSggCd>11110</roadNmSggCd>
          <roadNmbCd>0</roadNmbCd>
          <sggCd>11110</sggCd>
          <slerGbn>
          </slerGbn>
          <umdCd>18300</umdCd>
          <umdNm>평창동</umdNm>
        </item>
        <item>
          <aptDong>
          </aptDong>
          <aptNm>광화문스페이스본(106동)</aptNm>
          <aptSeq>11110-2204</aptSeq>
          <bonbun>0009</bonbun>
          <bubun>0001</bubun>
          <buildYear>2008</buildYear>
          <buyerGbn>
          </buyerGbn>
          <cdealDay>
          </cdealDay>
          <cdealType>
          </cdealType>
          <dealAmount>162,000</dealAmount>
          <dealDay>2</dealDay>
          <dealMonth>1</dealMonth>
          <dealYear>2020</dealYear>
          <dealingGbn>
          </dealingGbn>
          <estateAgentSggNm>
          </estateAgentSggNm>
          <excluUseAr>163.33</excluUseAr>
          <floor>2</floor>
          <jibun>9-1</jibun>
          <landCd>1</landCd>
          <landLeaseholdGbn>N</landLeaseholdGbn>
          <rgstDate>
          </rgstDate>
          <roadNm>경희궁길</roadNm>
          <roadNmBonbun>00057</roadNmBonbun>
          <roadNmBubun>00000</roadNmBubun>
          <roadNmCd>4100010</roadNmCd>
          <roadNmSeq>01</roadNmSeq>
          <roadNmSggCd>11110</roadNmSggCd>
          <roadNmbCd>0</roadNmbCd>
          <sggCd>11110</sggCd>
          <slerGbn>
          </slerGbn>
          <umdCd>11500</umdCd>
          <umdNm>사직동</umdNm>
        </item>

대략 이런 형식이야.
원래 사용하던 데이터보다 얼마나 더 정확한 결과를 가져올 수 있을지에 대해 평가하고, 코드를 이 api를 사용하도록 수정해 줘. 아파트 매매 관련만 해당이야. 전월세는 아직 이런 데이터가 없어.

