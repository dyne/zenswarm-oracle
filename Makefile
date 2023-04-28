RR_PORT := 443
RR_HOST := did.dyne.org
RR_SCHEMA := https

SECRET := secret
KEYS := keys.json

help: ## Display this help.
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_0-9-]+:.*?##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' Makefile

keygen: ## Generate a new oracle keyring [DESCRIPTION]
	$(if $(value DESCRIPTION), ,$(error Enter the final description that will be present in yout DID doc as DESCRIPTION="<description>"))
	@[ -d ${SECRET} ] || mkdir ${SECRET} ;\
	if [ -f ${SECRET}/${KEYS} ]; then printf "Delete the old ${SECRET}/${KEYS} file\n"; exit 1; fi ;\
	tmp=$$(mktemp) ;\
	echo "{\"controller\": \"${DESCRIPTION}\"}" > $${tmp} ;\
	zenroom -z -k $${tmp} contracts/create_keys_and_pks.zen | tee ${SECRET}/keys.json && \
	rm -f $${tmp}

announce: SIGN_KEYRING ?= oracle_keyring.json
announce: ## Create and send a DID request for the oracle [SIGN_KEYRING, ORACLE_KEYRING]
	$(if $(wildcard ${SIGN_KEYRING}),,$(error Oracle admin keyring not found in SIGN_KEYRING=${SIGN_KEYRING}, cannot sign))
	$(if $(value ORACLE_KEYRING),,$(error Oracle keyring not found, save it and add the path as ORACLE_KEYRING="<path>"))
	@tmp=$$(mktemp) ;\
	tmp2=$$(mktemp) ;\
	jq --arg ts $$(($$(date +%s%N)/1000000)) '.timestamp = $$ts' ${SIGN_KEYRING} > $${tmp} ;\
	jq -s '.[0] * .[1]' $${tmp} contracts/announce.keys > $${tmp2}  ;\
	zenroom -z -k $${tmp2} -a ${ORACLE_KEYRING} contracts/announce.zen > $${tmp} ;\
	restroom-test -s ${RR_SCHEMA} -h ${RR_HOST} -p ${RR_PORT} -u v1/sandbox/pubkeys-accept.chain -a $${tmp} | tee ${SECRET}/last_did.json ;\
	rm -f ${tmp} ${tmp2} ;\

goodbye: SIGN_KEYRING ?= oracle_keyring.json
goodbye: ## Oracle deannounce (deactivate DID) [SIGN_KEYRING, ORACLE_KEYRING]
	$(if $(wildcard ${SIGN_KEYRING}),,$(error Oracle admin keyring not found in SIGN_KEYRING=${SIGN_KEYRING}, cannot sign))
	$(if $(value ORACLE_KEYRING),,$(error Oracle keyring not found, save it and add the path as ORACLE_KEYRING="<path>"))
	@tmp=$$(mktemp) ;\
	tmp2=$$(mktemp) ;\
	jq -s '.[0] * .[1]' ${SIGN_KEYRING} contracts/goodbye.keys > $${tmp} ;\
	zenroom -z -k $${tmp} -a ${ORACLE_KEYRING} contracts/goodbye.zen > $${tmp2} ;\
	cat $${tmp2} ;\
	restroom-test -s ${RR_SCHEMA} -h ${RR_HOST} -p ${RR_PORT} -u v1/sandbox/pubkeys-deactivate.chain -a $${tmp2} ;\
	| tee ${SECRET}/last_did_deactivated.json ;\
	rm -f $${tmp} $${tmp2}
