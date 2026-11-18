import unittest

from garimpo.public_company_lookup import (
    ATTRIBUTION_URL, PublicLookupUnavailable, SOURCE_LABEL,
    parse_search_response, parse_public_people, safe_company_page,
)
from garimpo.company_identity import rank_candidates

CNPJ='11222333000181'


class PublicFallbackSafety(unittest.TestCase):
    def test_public_search_validates_city_and_keeps_unknown_fields_unknown(self):
        rows, partial=parse_search_response({'total':3,'resultados':[
            {'cnpj':CNPJ,'razao_social':'ALPHA BARBEARIA LTDA',
             'nome_fantasia':'ALPHA BARBEARIA','cidade':'Rio Grande',
             'uf':'RS','situacao':'Ativa',
             '_links':{'pagina':'https://www.datastone.com.br/consulta/empresa/alpha'}},
            {'cnpj':'11222333000262','razao_social':'ALPHA BARBEARIA LTDA',
             'nome_fantasia':'ALPHA BARBEARIA','cidade':'Pelotas','uf':'RS','situacao':'Ativa'},
            {'cnpj':'11111111111111','razao_social':'FAKE',
             'nome_fantasia':'FAKE','cidade':'Rio Grande','uf':'RS'}]})
        self.assertFalse(partial)
        self.assertEqual(len(rows),2)
        self.assertIsNone(rows[0]['headquarters'])
        self.assertEqual(rows[0]['source_provider'],SOURCE_LABEL)
        self.assertEqual(rows[0]['source_month'],'')
        self.assertEqual(rows[0]['main_cnae'],'')
        self.assertEqual(rows[0]['source_url'],'https://www.datastone.com.br/consulta/empresa/alpha')
        matches=rank_candidates('Alpha Barbearia em Rio Grande','Rio Grande','RS',rows)
        self.assertEqual([entry['cnpj'] for entry in matches],[CNPJ])
        self.assertFalse(matches[0]['identity_confirmed'])
        self.assertIsNone(matches[0]['headquarters'])

    def test_no_malicious_attribution_links(self):
        for link in ['https://www.datastone.com.br.attacker.test/consulta/empresa/alpha',
                     'http://www.datastone.com.br/consulta/empresa/alpha',
                     'javascript:alert(1)',
                     'https://www.datastone.com.br@evil.test/consulta/empresa/alpha',
                     'https://www.datastone.com.br/other-path']:
            self.assertEqual(safe_company_page(link),ATTRIBUTION_URL)
        self.assertEqual(safe_company_page(
            'https://www.datastone.com.br/consulta/empresa/alpha?tracking=123'),
            'https://www.datastone.com.br/consulta/empresa/alpha')

    def test_public_qsa_never_returns_private_fields(self):
        payload={'cnpj':CNPJ,'quadro_societario':[{
            'nome':'MARIA EXEMPLO','qualificacao':'Sócio-Administrador',
            'cpf':'***123456**','data_nascimento':'1970-01-01',
            'email':'privado@example.test','telefone':'53999998888'}],
            '_links':{'pagina':'https://www.datastone.com.br/consulta/empresa/alpha'}}
        answer=parse_public_people(payload,CNPJ)
        self.assertEqual(answer['people'][0]['partner_name'],'MARIA EXEMPLO')
        self.assertEqual(answer['people'][0]['role_label'],'Sócio-Administrador')
        self.assertNotIn('123456',str(answer))
        self.assertNotIn('privado@',str(answer))
        self.assertNotIn('53999998888',str(answer))
        self.assertNotIn('data_nascimento',str(answer))
        self.assertFalse(answer['truncated'])
        with self.assertRaises(PublicLookupUnavailable):
            parse_public_people(payload,'11222333000262')

    def test_search_limits_and_bad_payload_fail_closed(self):
        with self.assertRaises(PublicLookupUnavailable):
            parse_search_response({'empresas':[{'cnpj':CNPJ}]})
        raw={'total':11,'resultados':[{
            'cnpj':CNPJ,'nome_fantasia':'ALPHA BARBEARIA',
            'razao_social':'ALPHA BARBEARIA LTDA','cidade':'Rio Grande','uf':'RS',
        }]*10}
        values, incomplete = parse_search_response(raw)
        self.assertTrue(incomplete)
        self.assertLessEqual(len(values),10)


if __name__ == '__main__':
    unittest.main()
