default: test

#
# Run all tests
#
test: 
	node test/scripts/prepare-db.js
	vows test/*-test.js

.PHONY: test
