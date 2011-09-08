default: test

#
# Run all tests
#
test: 
	vows test/*-test.js

.PHONY: test
