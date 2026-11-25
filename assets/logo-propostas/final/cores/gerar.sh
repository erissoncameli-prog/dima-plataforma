#!/bin/bash
# nome bg1 bg2 barra1 barra2 centelha1 centelha2 linhas
cd "$(dirname "$0")"
while read n b1 b2 t1 t2 o1 o2 l; do
 sed -e "s/#1E293B/$b1/; s/#020617/$b2/; s/#2DD4BF/$t1/; s/#0EA5E9/$t2/; s/#FDE68A/$o1/; s/#F97316/$o2/; s/#5EEAD4/$l/; s/#FBBF24/$o2/g" ../icone.svg > "$n.svg"
done <<'L'
1-grafite-original #1E293B #020617 #2DD4BF #0EA5E9 #FDE68A #F97316 #5EEAD4
2-azul-safira #2563EB #172554 #7DD3FC #38BDF8 #FDE68A #F59E0B #BAE6FD
3-verde-floresta #15803D #052E16 #86EFAC #4ADE80 #FDE68A #EAB308 #BBF7D0
4-violeta #7C3AED #2E1065 #F0ABFC #E879F9 #FDE68A #F59E0B #F5D0FE
5-vinho #BE123C #4C0519 #FDA4AF #FB7185 #FEF3C7 #FBBF24 #FECDD3
6-petroleo #0F766E #042F2E #99F6E4 #5EEAD4 #FED7AA #FB923C #CCFBF1
7-grafite-coral #27272A #09090B #FDA4AF #F43F5E #FDE68A #F97316 #FECDD3
8-claro #F8FAFC #CBD5E1 #60A5FA #2563EB #FDE68A #F97316 #93C5FD
L
